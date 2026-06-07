import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { Cache } from '../../../../infrastructure/cache/cache.service'
import { SpaceEnv } from '../../../spaces/models/space-env.model'
import { CACHE_TASK_TTL } from '../../constants/cache'
import { FileTaskEvent } from '../../events/file-events'
import { FileTask, FileTaskProps } from '../../models/file-task'
import { dirName, fileName, fileSize, isPathIsDir } from '../../utils/files'
import { countDirEntriesAndSize, isActiveTaskStatus } from '../../utils/tasks'

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

  private readonly onStartWatch = (space: SpaceEnv, rPath: string): void => {
    this.startWatch(space, rPath)
  }

  private startWatch(space: SpaceEnv, rPath: string): void {
    const taskContext = space.task
    if (!taskContext?.cacheKey || taskContext.cacheKey in this.tasksWatcher) return
    const { cacheKey, props } = taskContext
    this.updateTask(cacheKey, props, {
      name: fileName(rPath),
      path: dirName(space.url)
    }).catch((e: Error) => this.logger.error({ tag: this.startWatch.name, msg: `${e}` }))
    this.watchTask(cacheKey, () => this.updateTask(cacheKey, space.task.props))
  }

  private watchTask(cacheKey: string, update: () => Promise<void>): void {
    // Cache updates may exceed the interval, so ticks use exhaust semantics.
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
        if (!isActiveTaskStatus(fileTask.status) || this.finalizingTasks.has(cacheKey)) {
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
}
