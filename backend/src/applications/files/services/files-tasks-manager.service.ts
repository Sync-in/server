import { HttpException, HttpStatus, Injectable, Logger, OnModuleDestroy, StreamableFile } from '@nestjs/common'
import { FastifyReply } from 'fastify'
import crypto from 'node:crypto'
import path from 'node:path'
import { FastifyAuthenticatedRequest } from '../../../authentication/interfaces/auth-request.interface'
import { currentTimeStamp } from '../../../common/shared'
import { Cache } from '../../../infrastructure/cache/cache.service'
import { SpaceEnv } from '../../spaces/models/space-env.model'
import { SpacesManager } from '../../spaces/services/spaces-manager.service'
import { realTrashPathFromSpace } from '../../spaces/utils/paths'
import { UserModel } from '../../users/models/user.model'
import { CACHE_TASK_CANCEL_PREFIX, CACHE_TASK_PREFIX, CACHE_TASK_TTL } from '../constants/cache'
import { FILE_OPERATION } from '../constants/operations'
import { CopyMoveFileDto } from '../dto/file-operations.dto'
import { FileTaskEvent } from '../events/file-events'
import type { FileTaskQueueItem } from '../interfaces/file-task-queue.interface'
import type { FileTasksPollResponse } from '../interfaces/file-task.interface'
import { FileTask, FileTaskProps, FileTaskStatus } from '../models/file-task'
import { countDirEntries, dirName, fileName, fileSize, isPathExists, isPathIsDir, removeFiles } from '../utils/files'
import { SendFile } from '../utils/send-file'
import { isTaskCancellable } from '../utils/tasks'
import { FilesMethods } from './files-methods.service'
import { FilesTasksQueue } from './files-tasks-queue.service'

@Injectable()
export class FilesTasksManager implements OnModuleDestroy {
  // Task cache key: `ftask-${userId}-${taskId}`.
  private readonly logger = new Logger(FilesTasksManager.name)
  private readonly watchInterval = 1000
  private tasksWatcher: Record<string, NodeJS.Timeout> = {}
  private tasksCancellationWatcher: Record<string, NodeJS.Timeout> = {}
  // Cache writes are serialized per task, while finalization blocks any late progress write.
  private pendingTaskUpdates = new Map<string, Promise<void>>()
  private finalizingTasks = new Set<string>()

  constructor(
    private readonly cache: Cache,
    private readonly filesMethods: FilesMethods,
    private readonly filesTasksQueue: FilesTasksQueue,
    private readonly spacesManager: SpacesManager
  ) {
    FileTaskEvent.on('startWatch', this.onStartWatch)
  }

  static getCacheKey(userId: number, taskId?: string): string {
    return `${CACHE_TASK_PREFIX}-${userId}-${taskId || '*'}`
  }

  static getCancellationCacheKey(userId: number, taskId: string): string {
    return `${CACHE_TASK_CANCEL_PREFIX}-${userId}-${taskId}`
  }

  onModuleDestroy(): void {
    FileTaskEvent.off('startWatch', this.onStartWatch)
    for (const cacheKey of Object.keys(this.tasksWatcher)) {
      this.stopWatch(cacheKey)
    }
    for (const cacheKey of Object.keys(this.tasksCancellationWatcher)) {
      this.stopCancellationWatch(cacheKey)
    }
  }

  async createTask(type: FILE_OPERATION, user: UserModel, space: SpaceEnv, dto: any, method: string): Promise<FileTask> {
    const taskId: string = crypto.randomUUID()
    const cacheKey = FilesTasksManager.getCacheKey(user.id, taskId)
    // MOVE and DELETE need their effective destination to determine whether they cross devices.
    const dstPath = await this.taskDestinationPath(type, user, space, dto)
    const cancellable = await isTaskCancellable(type, space.realPath, dstPath)
    const newTask = new FileTask(taskId, type, dirName(space.url), fileName(space.url), cancellable)
    await this.storeTask(cacheKey, newTask, FileTaskStatus.QUEUED)
    space.task = { cacheKey, props: {} }
    await this.filesTasksQueue.enqueue(user.id, { cacheKey, dto, method, space, task: newTask, user }, (task) => this.startQueuedTask(task))
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
      const tasks: FileTask[] = keys.length ? await this.cache.mget(keys) : []
      return tasks.filter((task: FileTask | null | undefined): task is FileTask => task != null)
    }
  }

  async pollTasks(userId: number, trackedIds: string[]): Promise<FileTasksPollResponse> {
    const tasks = (await this.getTasks(userId)) as FileTask[]
    const trackedTaskIds = new Set(trackedIds)
    const active: FileTask[] = []
    const ended: FileTask[] = []
    for (const task of tasks) {
      if (this.isActiveStatus(task.status)) {
        active.push(task)
      } else if (trackedTaskIds.has(task.id)) {
        ended.push(task)
      }
      trackedTaskIds.delete(task.id)
    }
    return { active, ended, missingIds: [...trackedTaskIds] }
  }

  async deleteTasks(user: UserModel, taskId?: string): Promise<void> {
    const cacheKey = FilesTasksManager.getCacheKey(user.id, taskId)
    const keys: string[] = taskId ? [cacheKey] : await this.cache.keys(cacheKey)
    if (!keys.length) return
    for (const key of keys) {
      const task: FileTask = await this.cache.get(key)
      if (!task || this.isActiveStatus(task.status)) continue
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

  async cancelTask(userId: number, taskId: string): Promise<void> {
    const cacheKey = FilesTasksManager.getCacheKey(userId, taskId)
    const task: FileTask = await this.cache.get(cacheKey)
    if (!task) {
      throw new HttpException('Task not found', HttpStatus.NOT_FOUND)
    }
    if (!this.isActiveStatus(task.status) || !task.cancellable) {
      throw new HttpException('Not applicable', HttpStatus.BAD_REQUEST)
    }
    if (task.status === FileTaskStatus.QUEUED) {
      this.filesTasksQueue.remove(userId, taskId)
      await this.setTaskDone(cacheKey, FileTaskStatus.CANCELLED, 'Cancelled')
      return
    }
    const isStored = await this.cache.set(FilesTasksManager.getCancellationCacheKey(userId, taskId), true, CACHE_TASK_TTL)
    if (!isStored) {
      throw new HttpException('Unable to cancel task', HttpStatus.INTERNAL_SERVER_ERROR)
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

  private async storeTask(cacheKey: string, task: FileTask, status = FileTaskStatus.PENDING) {
    task.startedAt = currentTimeStamp(null, true)
    task.status = status
    try {
      await this.cache.set(cacheKey, task, CACHE_TASK_TTL)
    } catch (e) {
      this.logger.error({ tag: this.storeTask.name, msg: `${e}` })
    }
  }

  private async setTaskDone(cacheKey: string, status: FileTaskStatus, result: any): Promise<void> {
    this.finalizingTasks.add(cacheKey)
    try {
      this.stopWatch(cacheKey)
      this.stopCancellationWatch(cacheKey)
      await this.pendingTaskUpdates.get(cacheKey)?.catch((e: Error) => this.logger.error({ tag: this.setTaskDone.name, msg: `${e}` }))
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
      await this.cache
        .del(cacheKey.replace(`${CACHE_TASK_PREFIX}-`, `${CACHE_TASK_CANCEL_PREFIX}-`))
        .catch((e: Error) => this.logger.error({ tag: this.setTaskDone.name, msg: `${e}` }))
    } finally {
      this.finalizingTasks.delete(cacheKey)
    }
  }

  private async startQueuedTask(task: FileTaskQueueItem): Promise<boolean> {
    const storedTask: FileTask = await this.cache.get(task.cacheKey)
    if (!storedTask || storedTask.status !== FileTaskStatus.QUEUED) return false
    task.task.status = FileTaskStatus.PENDING
    task.task.startedAt = currentTimeStamp(null, true)
    task.space.task = { cacheKey: task.cacheKey, props: task.task.props }
    await this.cache.set(task.cacheKey, task.task, CACHE_TASK_TTL)
    this.runTask(task)
    return true
  }

  private runTask(task: FileTaskQueueItem): void {
    // Only cancellable tasks receive a signal; its absence keeps same-device moves on the atomic path.
    const controller = this.watchCancellation(task.task, task.user.id, task.cacheKey)
    const taskPromise = controller
      ? this.filesMethods[task.method](task.user, task.space, task.dto, controller.signal)
      : this.filesMethods[task.method](task.user, task.space, task.dto)
    taskPromise
      .then((data: any) => {
        this.logger.debug({ tag: this.runTask.name, msg: `${task.task.name} : ${task.method} done` })
        this.completeTask(task.user.id, task.cacheKey, FileTaskStatus.SUCCESS, data).catch((e: Error) =>
          this.logger.warn({ tag: this.runTask.name, msg: `${e}` })
        )
      })
      .catch((e: HttpException | any) => {
        this.logger.warn({ tag: this.runTask.name, msg: `${task.task.name} : ${task.method} : ${e}` })
        const isCancellation = this.isCancellationError(e, controller)
        this.completeTask(
          task.user.id,
          task.cacheKey,
          isCancellation ? FileTaskStatus.CANCELLED : FileTaskStatus.ERROR,
          isCancellation ? 'Cancelled' : e.message
        ).catch((e: Error) => this.logger.error({ tag: this.runTask.name, msg: `${e}` }))
      })
  }

  private async completeTask(userId: number, cacheKey: string, status: FileTaskStatus, result: any): Promise<void> {
    try {
      await this.setTaskDone(cacheKey, status, result)
    } finally {
      await this.filesTasksQueue.releaseAndDrain(userId)
    }
  }

  private isActiveStatus(status: FileTaskStatus): boolean {
    return status === FileTaskStatus.PENDING || status === FileTaskStatus.QUEUED
  }

  private isCancellationError(error: unknown, controller?: AbortController): boolean {
    return controller?.signal.aborted === true && error === controller.signal.reason
  }

  private async taskDestinationPath(type: FILE_OPERATION, user: UserModel, space: SpaceEnv, dto: unknown): Promise<string | undefined> {
    try {
      if (type === FILE_OPERATION.MOVE) {
        const copyMoveDto = dto as CopyMoveFileDto
        const dstUrl = path.join(copyMoveDto.dstDirectory, copyMoveDto.dstName || fileName(space.realPath))
        return (await this.spacesManager.spaceEnv(user, dstUrl.split('/'))).realPath
      }
      if (type === FILE_OPERATION.DELETE && !space.inTrashRepository) {
        const baseTrashPath = realTrashPathFromSpace(user, space)
        if (baseTrashPath) {
          return path.join(baseTrashPath, dirName(space.dbFile.path), fileName(space.realPath))
        }
      }
    } catch {
      // Capability detection is best-effort; execution performs the authoritative validation later.
      return
    }
  }

  private updateTask(cacheKey: string, props?: FileTaskProps, task?: Partial<FileTask>): Promise<void> {
    if (this.finalizingTasks.has(cacheKey)) return Promise.resolve()
    const previousUpdate = this.pendingTaskUpdates.get(cacheKey) ?? Promise.resolve()
    const update = previousUpdate
      .catch(() => undefined)
      .then(async () => {
        if (this.finalizingTasks.has(cacheKey)) return
        let ftask: FileTask = await this.cache.get(cacheKey)
        if (!ftask) {
          this.stopWatch(cacheKey)
          return
        }
        // Finalization may have started while the cache read was pending.
        if (!this.isActiveStatus(ftask.status) || this.finalizingTasks.has(cacheKey)) {
          this.stopWatch(cacheKey)
          return
        }
        if (task) ftask = { ...ftask, ...task }
        if (props) ftask.props = { ...ftask.props, ...props }
        await this.cache.set(cacheKey, ftask, CACHE_TASK_TTL)
      })
    this.pendingTaskUpdates.set(cacheKey, update)
    return update.finally(() => {
      if (this.pendingTaskUpdates.get(cacheKey) === update) this.pendingTaskUpdates.delete(cacheKey)
    })
  }

  private startWatch(
    space: SpaceEnv,
    taskType: FILE_OPERATION,
    rPath: string,
    taskPath?: string,
    taskName = fileName(rPath),
    publishedPath?: string
  ): void {
    const taskContext = space.task
    if (!taskContext?.cacheKey || taskContext.cacheKey in this.tasksWatcher) return
    const { cacheKey, props } = taskContext
    this.logger.verbose({ tag: this.startWatch.name, msg: cacheKey })
    this.updateTask(cacheKey, props, {
      name: taskName,
      path: taskPath
    }).catch((e: Error) => this.logger.error({ tag: this.startWatch.name, msg: `${e}` }))
    switch (taskType) {
      case FILE_OPERATION.COMPRESS:
        this.watchTask(cacheKey, () => this.updateCompressTask(space, rPath, publishedPath))
        return
      case FILE_OPERATION.DECOMPRESS:
        this.watchTask(cacheKey, () => this.updateDecompressTask(space, rPath, publishedPath))
        return
      case FILE_OPERATION.DOWNLOAD:
        this.watchTask(cacheKey, () => this.updateDownloadTask(space, rPath, publishedPath))
        return
      case FILE_OPERATION.COPY:
      case FILE_OPERATION.DELETE:
      case FILE_OPERATION.MOVE:
        this.watchTask(cacheKey, () => this.updateCopyMoveTask(space, rPath))
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
    // Directory scans may exceed the interval, so ticks use exhaust semantics.
    let updateInProgress = false
    const watcher = setInterval(() => {
      if (updateInProgress) return
      updateInProgress = true
      void update()
        .catch((e: Error) => this.logger.error({ tag: this.watchTask.name, msg: `${e}` }))
        .finally(() => {
          updateInProgress = false
        })
    }, this.watchInterval)
    watcher.unref()
    this.tasksWatcher[cacheKey] = watcher
  }

  private watchCancellation(task: FileTask, userId: number, cacheKey: string): AbortController | undefined {
    if (!task.cancellable) return
    const controller = new AbortController()
    const cancellationCacheKey = FilesTasksManager.getCancellationCacheKey(userId, task.id)
    // Cancellation is requested independently through the shared task cache.
    const watcher = setInterval(() => void this.abortTaskIfRequested(cacheKey, cancellationCacheKey, controller), this.watchInterval)
    watcher.unref()
    this.tasksCancellationWatcher[cacheKey] = watcher
    return controller
  }

  private async abortTaskIfRequested(cacheKey: string, cancellationCacheKey: string, controller: AbortController): Promise<void> {
    try {
      if (!(await this.cache.get(cancellationCacheKey))) return
      controller.abort(new Error('Cancelled'))
      this.stopCancellationWatch(cacheKey)
      await this.cache.del(cancellationCacheKey)
    } catch (e) {
      this.logger.error({ tag: this.abortTaskIfRequested.name, msg: `${e}` })
    }
  }

  private stopCancellationWatch(cacheKey: string): void {
    if (!(cacheKey in this.tasksCancellationWatcher)) return
    clearInterval(this.tasksCancellationWatcher[cacheKey])
    delete this.tasksCancellationWatcher[cacheKey]
  }

  private async updateCompressTask(space: SpaceEnv, rPath: string, publishedPath?: string): Promise<void> {
    try {
      const size = await this.readWatchedPath(rPath, publishedPath, fileSize)
      if (size === undefined) return
      space.task.props.size = size
      await this.updateTask(space.task.cacheKey, space.task.props)
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
      await this.updateTask(space.task.cacheKey, space.task.props)
    } catch (e) {
      this.logger.error({ tag: this.updateDecompressTask.name, msg: `${e}` })
      this.stopWatch(space.task.cacheKey)
    }
  }

  private async updateDownloadTask(space: SpaceEnv, rPath: string, publishedPath?: string): Promise<void> {
    try {
      if (!(await this.calcSizeAndProgressTask(space, rPath, publishedPath))) return
      await this.updateTask(space.task.cacheKey, space.task.props)
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
      await this.updateTask(space.task.cacheKey, space.task.props)
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
