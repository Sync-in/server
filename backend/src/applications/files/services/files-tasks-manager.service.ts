import { HttpException, HttpStatus, Injectable, Logger, OnModuleDestroy, StreamableFile } from '@nestjs/common'
import { FastifyReply } from 'fastify'
import crypto from 'node:crypto'
import path from 'node:path'
import { FastifyAuthenticatedRequest } from '../../../authentication/interfaces/auth-request.interface'
import { currentTimeStamp } from '../../../common/shared'
import { Cache } from '../../../infrastructure/cache/cache.service'
import { SpaceEnv } from '../../spaces/models/space-env.model'
import { UserModel } from '../../users/models/user.model'
import { CACHE_TASK_PREFIX, CACHE_TASK_TTL } from '../constants/cache'
import { FILE_OPERATION } from '../constants/operations'
import { FileTask, FileTaskProps, FileTaskStatus } from '../models/file-task'
import { countDirEntries, dirName, fileName, fileSize, isPathExists, isPathIsDir, removeFiles } from '../utils/files'
import { SendFile } from '../utils/send-file'
import { FilesMethods } from './files-methods.service'
import { FileTaskEvent } from '../events/file-events'

@Injectable()
export class FilesTasksManager implements OnModuleDestroy {
  // task cache key = `ftask-$(userId}-${taskId}` => FileTask
  private readonly logger = new Logger(FilesTasksManager.name)
  private readonly watchInterval = 1000
  private tasksWatcher: Record<string, NodeJS.Timeout> = {}

  constructor(
    private readonly cache: Cache,
    private readonly filesMethods: FilesMethods
  ) {
    FileTaskEvent.on('startWatch', this.onStartWatch)
  }

  static getCacheKey(userId: number, taskId?: string): string {
    return `${CACHE_TASK_PREFIX}-${userId}-${taskId || '*'}`
  }

  onModuleDestroy(): void {
    FileTaskEvent.off('startWatch', this.onStartWatch)
    for (const cacheKey of Object.keys(this.tasksWatcher)) {
      this.stopWatch(cacheKey)
    }
  }

  async createTask(type: FILE_OPERATION, user: UserModel, space: SpaceEnv, dto: any, method: string): Promise<FileTask> {
    const taskId: string = crypto.randomUUID()
    const cacheKey = FilesTasksManager.getCacheKey(user.id, taskId)
    const newTask = new FileTask(taskId, type, dirName(space.url), fileName(space.url))
    await this.storeTask(cacheKey, newTask)
    space.task = { cacheKey: cacheKey, props: {} }
    this.filesMethods[method](user, space, dto)
      .then((data: any) => {
        this.logger.debug({ tag: this.createTask.name, msg: `${newTask.name} : ${method} done` })
        this.setTaskDone(cacheKey, FileTaskStatus.SUCCESS, data).catch((e: Error) => this.logger.error({ tag: this.createTask.name, msg: `${e}` }))
      })
      .catch((e: HttpException | any) => {
        this.logger.error({ tag: this.createTask.name, msg: `${newTask.name} : ${method} : ${e}` })
        this.setTaskDone(cacheKey, FileTaskStatus.ERROR, e.message).catch((e: Error) => this.logger.error({ tag: this.createTask.name, msg: `${e}` }))
      })
    return newTask
  }

  async getTasks(userId: number, taskId?: string): Promise<FileTask | FileTask[]> {
    const cacheKey = FilesTasksManager.getCacheKey(userId, taskId)
    if (taskId) {
      const task: FileTask = await this.cache.get(cacheKey)
      if (task) return task
      throw new HttpException('Task not found', HttpStatus.NOT_FOUND)
    } else {
      const keys = await this.cache.keys(cacheKey)
      return keys.length ? await this.cache.mget(keys) : []
    }
  }

  async deleteTasks(user: UserModel, taskId?: string): Promise<void> {
    const cacheKey = FilesTasksManager.getCacheKey(user.id, taskId)
    let keys: string[]
    if (taskId) {
      keys = [cacheKey]
    } else {
      keys = await this.cache.keys(cacheKey)
    }
    if (!keys.length) return
    for (const key of keys) {
      const task: FileTask = await this.cache.get(key)
      if (!task || task.status === FileTaskStatus.PENDING) continue
      if (task.props.compressInDirectory === false) {
        // delete task file
        const rPath = path.join(user.tasksPath, task.name)
        removeFiles(rPath).catch((e: Error) => this.logger.error({ tag: this.deleteTasks.name, msg: `${e}` }))
      }
      // clear watcher
      this.stopWatch(key)
      // remove from cache
      this.cache.del(key).catch((e: Error) => this.logger.error({ tag: this.deleteTasks.name, msg: `${e}` }))
    }
  }

  async downloadArchive(user: UserModel, taskId: string, req: FastifyAuthenticatedRequest, res: FastifyReply): Promise<StreamableFile> {
    const cacheKey = FilesTasksManager.getCacheKey(user.id, taskId)
    const task: FileTask = await this.cache.get(cacheKey)
    if (!task || task.status !== FileTaskStatus.SUCCESS || task.props.compressInDirectory !== false) {
      throw new HttpException('Not applicable', HttpStatus.BAD_REQUEST)
    }
    const rPath = path.join(user.tasksPath, task.name)
    const sendFile = new SendFile(rPath)
    try {
      await sendFile.checks()
    } catch (e) {
      throw new HttpException(e.message, e.httpCode)
    }
    return await sendFile.stream(req, res)
  }

  private async storeTask(cacheKey: string, task: FileTask) {
    task.startedAt = currentTimeStamp(null, true)
    task.status = FileTaskStatus.PENDING
    try {
      await this.cache.set(cacheKey, task, CACHE_TASK_TTL)
    } catch (e) {
      this.logger.error({ tag: this.storeTask.name, msg: `${e}` })
    }
  }

  private async setTaskDone(cacheKey: string, status: FileTaskStatus, result: any): Promise<void> {
    const task: FileTask = await this.cache.get(cacheKey)
    if (task) {
      task.status = status
      task.endedAt = currentTimeStamp(null, true)
      if (result) {
        if (typeof result === 'string') {
          task.result = result
        } else {
          Object.assign(task, result)
        }
      }
      await this.cache.set(cacheKey, task, CACHE_TASK_TTL)
    }
    this.stopWatch(cacheKey)
  }

  private async updateTask(cacheKey: string, props?: FileTaskProps, task?: Partial<FileTask>): Promise<void> {
    let ftask: FileTask = await this.cache.get(cacheKey)
    if (ftask) {
      if (task) ftask = { ...ftask, ...task }
      if (props) ftask.props = { ...ftask.props, ...props }
      await this.cache.set(cacheKey, ftask, CACHE_TASK_TTL)
    } else {
      this.stopWatch(cacheKey)
    }
  }

  private startWatch(
    space: SpaceEnv,
    taskType: FILE_OPERATION,
    rPath: string,
    taskPath?: string,
    taskName = fileName(rPath),
    publishedPath?: string
  ): void {
    if (!space.task?.cacheKey || space.task.cacheKey in this.tasksWatcher) return
    this.logger.verbose({ tag: this.startWatch.name, msg: `${space.task.cacheKey}` })
    this.updateTask(space.task.cacheKey, space.task?.props, {
      name: taskName,
      path: taskPath
    }).catch((e: Error) => this.logger.error({ tag: this.startWatch.name, msg: `${e}` }))
    switch (taskType) {
      case FILE_OPERATION.COMPRESS:
        this.watchTask(space.task.cacheKey, () => this.updateCompressTask(space, rPath, publishedPath))
        return
      case FILE_OPERATION.DECOMPRESS:
        this.watchTask(space.task.cacheKey, () => this.updateDecompressTask(space, rPath, publishedPath))
        return
      case FILE_OPERATION.DOWNLOAD:
        this.watchTask(space.task.cacheKey, () => this.updateDownloadTask(space, rPath, publishedPath))
        return
      case FILE_OPERATION.COPY:
      case FILE_OPERATION.MOVE:
        this.watchTask(space.task.cacheKey, () => this.updateCopyMoveTask(space, rPath))
        return
      default:
        this.logger.warn({ tag: this.startWatch.name, msg: `unknown task type ${taskType}` })
        return
    }
  }

  private stopWatch(cacheKey: string): void {
    if (!(cacheKey in this.tasksWatcher)) return
    clearInterval(this.tasksWatcher[cacheKey])
    delete this.tasksWatcher[cacheKey]
  }

  private readonly onStartWatch = (space: SpaceEnv, taskType: FILE_OPERATION, rPath: string, watchPath?: string): void => {
    this.startWatch(space, taskType, watchPath || rPath, dirName(space.url), fileName(rPath), watchPath ? rPath : undefined)
  }

  private watchTask(cacheKey: string, update: () => Promise<void>): void {
    const watcher = setInterval(() => void update(), this.watchInterval)
    watcher.unref()
    this.tasksWatcher[cacheKey] = watcher
  }

  private async updateCompressTask(space: SpaceEnv, rPath: string, publishedPath?: string): Promise<void> {
    try {
      const size = await this.readWatchedPath(rPath, publishedPath, fileSize)
      if (size === undefined) return
      space.task.props.size = size
      await this.updateTask(space.task.cacheKey, space.task.props).catch((e: Error) =>
        this.logger.error({ tag: this.updateCompressTask.name, msg: `${e}` })
      )
    } catch (e) {
      this.logger.error({ tag: this.updateCompressTask.name, msg: `${e}` })
      this.stopWatch(space.task.cacheKey)
    }
  }

  private async updateDecompressTask(space: SpaceEnv, rPath: string, publishedPath?: string): Promise<void> {
    try {
      const props = await this.readWatchedPath(rPath, publishedPath, countDirEntries)
      if (props === undefined) return
      space.task.props = props
      this.updateTask(space.task.cacheKey, space.task.props).catch((e: Error) =>
        this.logger.error({ tag: this.updateDecompressTask.name, msg: `${e}` })
      )
    } catch (e) {
      this.logger.error({ tag: this.updateDecompressTask.name, msg: `${e}` })
      this.stopWatch(space.task.cacheKey)
    }
  }

  private async updateDownloadTask(space: SpaceEnv, rPath: string, publishedPath?: string): Promise<void> {
    try {
      if (!(await this.calcSizeAndProgressTask(space, rPath, publishedPath))) return
      this.updateTask(space.task.cacheKey, space.task.props).catch((e: Error) =>
        this.logger.error({ tag: this.updateDownloadTask.name, msg: `${e}` })
      )
    } catch (e) {
      this.logger.error({ tag: this.updateDownloadTask.name, msg: `${e}` })
      this.stopWatch(space.task.cacheKey)
    }
  }

  private async updateCopyMoveTask(space: SpaceEnv, rPath: string): Promise<void> {
    try {
      if (await isPathIsDir(rPath)) {
        space.task.props = await countDirEntries(rPath)
      } else {
        await this.calcSizeAndProgressTask(space, rPath)
      }
      this.updateTask(space.task.cacheKey, space.task.props).catch((e: Error) =>
        this.logger.error({ tag: this.updateCopyMoveTask.name, msg: `${e}` })
      )
    } catch (e) {
      this.logger.error({ tag: this.updateCopyMoveTask.name, msg: `${e}` })
      this.stopWatch(space.task.cacheKey)
    }
  }

  private async calcSizeAndProgressTask(space: SpaceEnv, rPath: string, publishedPath?: string): Promise<boolean> {
    const size = await this.readWatchedPath(rPath, publishedPath, fileSize)
    if (size === undefined) return false
    space.task.props.size = size
    if (space.task.props.totalSize) {
      space.task.props.progress = (100 * space.task.props.size) / space.task.props.totalSize
    }
    return true
  }

  private async readWatchedPath<T>(rPath: string, publishedPath: string | undefined, read: (rPath: string) => Promise<T>): Promise<T | undefined> {
    if (!publishedPath) return read(rPath)
    if (await isPathExists(rPath)) {
      try {
        const value = await read(rPath)
        // The temporary path may be moved atomically while it is being read.
        if (await isPathExists(rPath)) return value
      } catch (e) {
        // Retry the published path only when the temporary path disappeared during publication.
        if (e?.code !== 'ENOENT') throw e
      }
    }
    if (await isPathExists(publishedPath)) return read(publishedPath)
  }
}
