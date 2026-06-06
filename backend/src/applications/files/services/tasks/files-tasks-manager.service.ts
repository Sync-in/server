import { HttpException, HttpStatus, Injectable, Logger, OnModuleDestroy, StreamableFile } from '@nestjs/common'
import { FastifyReply } from 'fastify'
import crypto from 'node:crypto'
import path from 'node:path'
import { FastifyAuthenticatedRequest } from '../../../../authentication/interfaces/auth-request.interface'
import { currentTimeStamp } from '../../../../common/shared'
import { Cache } from '../../../../infrastructure/cache/cache.service'
import { SpaceEnv } from '../../../spaces/models/space-env.model'
import { SpacesManager } from '../../../spaces/services/spaces-manager.service'
import { realTrashPathFromSpace } from '../../../spaces/utils/paths'
import { UserModel } from '../../../users/models/user.model'
import { CACHE_TASK_CANCEL_PREFIX, CACHE_TASK_PREFIX, CACHE_TASK_TTL } from '../../constants/cache'
import { FILE_OPERATION } from '../../constants/operations'
import { CopyMoveFileDto } from '../../dto/file-operations.dto'
import type { FileTaskQueueItem } from '../../interfaces/file-task-queue.interface'
import type { FileTasksPollResponse } from '../../interfaces/file-task.interface'
import { FileTask, FileTaskProps, FileTaskStatus } from '../../models/file-task'
import { dirName, fileName, removeFiles } from '../../utils/files'
import { SendFile } from '../../utils/send-file'
import { isTaskCancellable } from '../../utils/tasks'
import { FilesMethods } from '../files-methods.service'
import { FilesTasksQueue } from './files-tasks-queue.service'
import { FilesTasksWatcher } from './files-tasks-watcher.service'

@Injectable()
export class FilesTasksManager implements OnModuleDestroy {
  // Task cache key: `ftask-${userId}-${taskId}`.
  private readonly logger = new Logger(FilesTasksManager.name)
  private readonly watchInterval = 1000
  private tasksCancellationWatcher: Record<string, NodeJS.Timeout> = {}

  constructor(
    private readonly cache: Cache,
    private readonly filesMethods: FilesMethods,
    private readonly filesTasksQueue: FilesTasksQueue,
    private readonly filesTasksWatcher: FilesTasksWatcher,
    private readonly spacesManager: SpacesManager
  ) {}

  static getCacheKey(userId: number, taskId?: string): string {
    return `${CACHE_TASK_PREFIX}-${userId}-${taskId || '*'}`
  }

  static getCancellationCacheKey(userId: number, taskId: string): string {
    return `${CACHE_TASK_CANCEL_PREFIX}-${userId}-${taskId}`
  }

  onModuleDestroy(): void {
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
      this.filesTasksWatcher.stopWatch(key)
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

  private async setTaskDone(cacheKey: string, status: FileTaskStatus, result: any, finalProps?: FileTaskProps): Promise<void> {
    await this.filesTasksWatcher.beginFinalization(cacheKey)
    try {
      this.stopCancellationWatch(cacheKey)
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
        if (finalProps) {
          task.props = { ...task.props, ...finalProps }
        }
        await this.cache.set(cacheKey, task, CACHE_TASK_TTL)
      }
      await this.cache
        .del(cacheKey.replace(`${CACHE_TASK_PREFIX}-`, `${CACHE_TASK_CANCEL_PREFIX}-`))
        .catch((e: Error) => this.logger.error({ tag: this.setTaskDone.name, msg: `${e}` }))
    } finally {
      this.filesTasksWatcher.endFinalization(cacheKey)
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
      .then(async (data: any) => {
        this.logger.debug({ tag: this.runTask.name, msg: `${task.task.name} : ${task.method} done` })
        const finalProps = await this.getFinalTransferProps(task, data)
        this.completeTask(task.user.id, task.cacheKey, FileTaskStatus.SUCCESS, data, finalProps).catch((e: Error) =>
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

  private async completeTask(userId: number, cacheKey: string, status: FileTaskStatus, result: any, finalProps?: FileTaskProps): Promise<void> {
    try {
      await this.setTaskDone(cacheKey, status, result, finalProps)
    } finally {
      await this.filesTasksQueue.releaseAndDrain(userId)
    }
  }

  private async getFinalTransferProps(task: FileTaskQueueItem, result: any): Promise<FileTaskProps | undefined> {
    if (task.task.type === FILE_OPERATION.DELETE) {
      const props = task.space.task?.props
      return {
        ...props,
        ...(props?.totalSize !== undefined ? { size: props.totalSize } : {}),
        progress: 100
      }
    }
    if (task.task.type !== FILE_OPERATION.COPY && task.task.type !== FILE_OPERATION.MOVE) return
    if (!result?.path || !result?.name) return
    try {
      const publishedUrl = path.join(result.path, result.name)
      const publishedSpace = await this.spacesManager.spaceEnv(task.user, publishedUrl.split('/'))
      const props = await this.filesTasksWatcher.getPathProps(publishedSpace.realPath)
      return { ...props, progress: 100 }
    } catch (e) {
      this.logger.warn({ tag: this.getFinalTransferProps.name, msg: `${e}` })
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
}
