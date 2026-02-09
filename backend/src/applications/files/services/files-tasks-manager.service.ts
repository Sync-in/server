import { HttpException, HttpStatus, Injectable, Logger, StreamableFile } from '@nestjs/common'
import { FastifyReply } from 'fastify'
import crypto from 'node:crypto'
import path from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { FastifyAuthenticatedRequest } from '../../../authentication/interfaces/auth-request.interface'

import { currentTimeStamp } from '../../../common/shared'
import { Cache } from '../../../infrastructure/cache/services/cache.service'
import { SpaceEnv } from '../../spaces/models/space-env.model'
import { UserModel } from '../../users/models/user.model'
import { CACHE_TASK_PREFIX, CACHE_TASK_TTL } from '../constants/cache'
import { FILE_OPERATION } from '../constants/operations'
import { FileTaskEvent } from '../events/file-task-event'
import { FileTask, FileTaskProps, FileTaskStatus } from '../models/file-task'
import { countDirEntries, dirName, fileName, fileSize, isPathIsDir, removeFiles } from '../utils/files'
import { SendFile } from '../utils/send-file'
import { FilesMethods } from './files-methods.service'

@Injectable()
export class FilesTasksManager {
  // task cache key = `ftask-$(userId}-${taskId}` => FileTask
  private readonly logger = new Logger(FilesTasksManager.name)
  private readonly watchInterval = 1000
  private tasksWatcher: Record<string, any> = {}

  constructor(
    private readonly cache: Cache,
    private readonly filesMethods: FilesMethods
  ) {
    FileTaskEvent.on('startWatch', async (space: SpaceEnv, taskType: FILE_OPERATION, rPath: string) =>
      this.startWatch(space, taskType, rPath, dirName(space.url))
    )
  }

  static getCacheKey(userId: number, taskId?: string): string {
    return `${CACHE_TASK_PREFIX}-${userId}-${taskId || '*'}`
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
      this.stopWatch(key).catch((e: Error) => this.logger.error({ tag: this.deleteTasks.name, msg: `${e}` }))
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
    await this.stopWatch(cacheKey)
  }

  private async updateTask(cacheKey: string, props?: FileTaskProps, task?: Partial<FileTask>): Promise<void> {
    let ftask: FileTask = await this.cache.get(cacheKey)
    if (ftask) {
      if (task) ftask = { ...ftask, ...task }
      if (props) ftask.props = { ...ftask.props, ...props }
      await this.cache.set(cacheKey, ftask, CACHE_TASK_TTL)
    } else {
      await this.stopWatch(cacheKey)
    }
  }

  private async startWatch(space: SpaceEnv, taskType: FILE_OPERATION, rPath: string, taskPath?: string): Promise<void> {
    if (!space.task?.cacheKey || space.task.cacheKey in this.tasksWatcher) return
    this.logger.verbose({ tag: this.startWatch.name, msg: `${space.task.cacheKey}` })
    this.updateTask(space.task.cacheKey, space.task?.props, {
      name: fileName(rPath),
      path: taskPath
    }).catch((e: Error) => this.logger.error({ tag: this.startWatch.name, msg: `${e}` }))
    switch (taskType) {
      case FILE_OPERATION.COMPRESS:
        this.tasksWatcher[space.task.cacheKey] = setInterval(async () => this.updateCompressTask(space, rPath), this.watchInterval)
        return
      case FILE_OPERATION.DECOMPRESS:
        this.tasksWatcher[space.task.cacheKey] = setInterval(async () => this.updateDecompressTask(space, rPath), this.watchInterval)
        return
      case FILE_OPERATION.DOWNLOAD:
        this.tasksWatcher[space.task.cacheKey] = setInterval(async () => this.updateDownloadTask(space, rPath), this.watchInterval)
        return
      case FILE_OPERATION.COPY:
      case FILE_OPERATION.MOVE:
        this.tasksWatcher[space.task.cacheKey] = setInterval(async () => this.updateCopyMoveTask(space, rPath), this.watchInterval)
        return
      default:
        this.logger.warn({ tag: this.startWatch.name, msg: `unknown task type ${taskType}` })
        return
    }
  }

  private async stopWatch(cacheKey: string): Promise<void> {
    if (!(cacheKey in this.tasksWatcher)) return
    await setTimeout(this.watchInterval)
    clearInterval(this.tasksWatcher[cacheKey])
    delete this.tasksWatcher[cacheKey]
  }

  private async updateCompressTask(space: SpaceEnv, rPath: string): Promise<void> {
    try {
      space.task.props.size = await fileSize(rPath)
      await this.updateTask(space.task.cacheKey, space.task.props).catch((e: Error) =>
        this.logger.error({ tag: this.updateCompressTask.name, msg: `${e}` })
      )
    } catch (e) {
      this.logger.error({ tag: this.updateCompressTask.name, msg: `${e}` })
      await this.stopWatch(space.task.cacheKey)
    }
  }

  private async updateDecompressTask(space: SpaceEnv, rPath: string): Promise<void> {
    try {
      space.task.props = await countDirEntries(rPath)
      this.updateTask(space.task.cacheKey, space.task.props).catch((e: Error) =>
        this.logger.error({ tag: this.updateDecompressTask.name, msg: `${e}` })
      )
    } catch (e) {
      this.logger.error({ tag: this.updateDecompressTask.name, msg: `${e}` })
      await this.stopWatch(space.task.cacheKey)
    }
  }

  private async updateDownloadTask(space: SpaceEnv, rPath: string): Promise<void> {
    try {
      await this.calcSizeAndProgressTask(space, rPath)
      this.updateTask(space.task.cacheKey, space.task.props).catch((e: Error) =>
        this.logger.error({ tag: this.updateDownloadTask.name, msg: `${e}` })
      )
    } catch (e) {
      this.logger.error({ tag: this.updateDownloadTask.name, msg: `${e}` })
      await this.stopWatch(space.task.cacheKey)
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
      await this.stopWatch(space.task.cacheKey)
    }
  }

  private async calcSizeAndProgressTask(space: SpaceEnv, rPath: string) {
    space.task.props.size = await fileSize(rPath)
    if (space.task.props.totalSize) {
      space.task.props.progress = (100 * space.task.props.size) / space.task.props.totalSize
    }
  }
}
