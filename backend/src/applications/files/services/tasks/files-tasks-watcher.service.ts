import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { Cache } from '../../../../infrastructure/cache/cache.service'
import { SpaceEnv } from '../../../spaces/models/space-env.model'
import { CACHE_TASK_TTL } from '../../constants/cache'
import { FILE_OPERATION } from '../../constants/operations'
import { FileTaskEvent } from '../../events/file-events'
import { FileTask, FileTaskProps, FileTaskStatus } from '../../models/file-task'
import { dirName, fileName, fileSize, isPathExists, isPathIsDir } from '../../utils/files'
import { countDirEntriesAndSize } from '../../utils/tasks'

@Injectable()
export class FilesTasksWatcher implements OnModuleDestroy {
  private readonly logger = new Logger(FilesTasksWatcher.name)
  private readonly watchInterval = 1000
  private tasksWatcher: Record<string, NodeJS.Timeout> = {}
  private pendingTaskUpdates = new Map<string, Promise<void>>()
  private finalizingTasks = new Set<string>()

  constructor(private readonly cache: Cache) {
    FileTaskEvent.on('startWatch', this.onStartWatch)
  }

  onModuleDestroy(): void {
    FileTaskEvent.off('startWatch', this.onStartWatch)
    for (const cacheKey of Object.keys(this.tasksWatcher)) {
      this.stopWatch(cacheKey)
    }
  }

  async beginFinalization(cacheKey: string): Promise<void> {
    this.finalizingTasks.add(cacheKey)
    this.stopWatch(cacheKey)
    await this.pendingTaskUpdates.get(cacheKey)?.catch((e: Error) => this.logger.error({ tag: this.beginFinalization.name, msg: `${e}` }))
  }

  endFinalization(cacheKey: string): void {
    this.finalizingTasks.delete(cacheKey)
  }

  stopWatch(cacheKey: string): void {
    if (!(cacheKey in this.tasksWatcher)) return
    clearInterval(this.tasksWatcher[cacheKey])
    delete this.tasksWatcher[cacheKey]
  }

  async getPathProps(rPath: string): Promise<Pick<FileTaskProps, 'files' | 'directories' | 'size'>> {
    return (await isPathIsDir(rPath)) ? countDirEntriesAndSize(rPath) : { size: await fileSize(rPath) }
  }

  private readonly onStartWatch = (space: SpaceEnv, taskType: FILE_OPERATION, rPath: string, watchPath?: string): void => {
    this.startWatch(space, taskType, watchPath || rPath, dirName(space.url), fileName(rPath), watchPath ? rPath : undefined)
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
        this.watchTask(cacheKey, () => this.updateTask(cacheKey, space.task.props))
        return
      default:
        this.logger.warn({ tag: this.startWatch.name, msg: `unknown task type ${taskType}` })
    }
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

  private updateTask(cacheKey: string, props?: FileTaskProps, task?: Partial<FileTask>): Promise<void> {
    if (this.finalizingTasks.has(cacheKey)) return Promise.resolve()
    const previousUpdate = this.pendingTaskUpdates.get(cacheKey) ?? Promise.resolve()
    const update = previousUpdate
      .catch(() => undefined)
      .then(async () => {
        if (this.finalizingTasks.has(cacheKey)) return
        let fileTask: FileTask = await this.cache.get(cacheKey)
        if (!fileTask) {
          this.stopWatch(cacheKey)
          return
        }
        if (!this.isActiveStatus(fileTask.status) || this.finalizingTasks.has(cacheKey)) {
          this.stopWatch(cacheKey)
          return
        }
        if (task) fileTask = { ...fileTask, ...task }
        if (props) fileTask.props = { ...fileTask.props, ...props }
        await this.cache.set(cacheKey, fileTask, CACHE_TASK_TTL)
      })
    this.pendingTaskUpdates.set(cacheKey, update)
    return update.finally(() => {
      if (this.pendingTaskUpdates.get(cacheKey) === update) this.pendingTaskUpdates.delete(cacheKey)
    })
  }

  private isActiveStatus(status: FileTaskStatus): boolean {
    return status === FileTaskStatus.PENDING || status === FileTaskStatus.QUEUED
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
      const props = await this.readWatchedPath(rPath, publishedPath, countDirEntriesAndSize)
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

  private async calcSizeAndProgressTask(space: SpaceEnv, rPath: string, publishedPath?: string): Promise<boolean> {
    const isDir = await this.readWatchedPath(rPath, publishedPath, isPathIsDir)
    if (isDir === undefined) return false
    if (isDir) {
      const props = await this.readWatchedPath(rPath, publishedPath, countDirEntriesAndSize)
      if (props === undefined) return false
      space.task.props = { ...space.task.props, ...props }
    } else {
      const size = await this.readWatchedPath(rPath, publishedPath, fileSize)
      if (size === undefined) return false
      space.task.props.size = size
    }
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
