import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { Cache } from '../../../../infrastructure/cache/cache.service'
import { CACHE_TASK_TTL, CACHE_TASK_USER_PREFIX } from '../../constants/cache'
import type { FileTaskQueueEntry, FileTaskQueueItem, FileTaskQueueStarter } from '../../interfaces/file-task-queue.interface'

@Injectable()
export class FilesTasksQueue implements OnModuleDestroy {
  private readonly logger = new Logger(FilesTasksQueue.name)
  private readonly maxRunningTasksPerUser = 3
  private readonly drainInterval = 1000
  private drainingUsers = new Set<number>()
  private queuedTasks: Record<number, FileTaskQueueEntry[]> = {}
  private queuedTasksDrainInterval: NodeJS.Timeout | undefined

  constructor(private readonly cache: Cache) {}

  static getUserRunningTasksCacheKey(userId: number): string {
    return `${CACHE_TASK_USER_PREFIX}-${userId}`
  }

  onModuleDestroy(): void {
    this.stop()
  }

  async enqueue(userId: number, task: FileTaskQueueItem, startTask: FileTaskQueueStarter): Promise<void> {
    ;(this.queuedTasks[userId] ??= []).push({ task, startTask })
    this.startQueueDrainInterval()
    await this.drain(userId)
  }

  remove(userId: number, taskId: string): void {
    const queue = this.queuedTasks[userId]
    if (!queue) return
    const taskIndex = queue.findIndex((entry: FileTaskQueueEntry) => entry.task.task.id === taskId)
    if (taskIndex !== -1) {
      queue.splice(taskIndex, 1)
    }
    if (!queue.length) {
      delete this.queuedTasks[userId]
      this.stopQueueDrainIntervalIfIdle()
    }
  }

  async releaseAndDrain(userId: number): Promise<void> {
    await this.releaseUserRunningTaskSlot(userId)
    await this.drain(userId)
  }

  stop(): void {
    if (!this.queuedTasksDrainInterval) return
    clearInterval(this.queuedTasksDrainInterval)
    this.queuedTasksDrainInterval = undefined
  }

  private async drain(userId: number): Promise<void> {
    if (this.drainingUsers.has(userId)) return
    this.drainingUsers.add(userId)
    try {
      const queue = this.queuedTasks[userId]
      if (!queue?.length) {
        this.stopQueueDrainIntervalIfIdle()
        return
      }
      while (queue.length) {
        if (!(await this.claimUserRunningTaskSlot(userId))) break
        const entry = queue.shift()
        try {
          if (entry && (await entry.startTask(entry.task))) continue
        } catch (e) {
          this.logger.error({ tag: this.drain.name, msg: `${e}` })
        }
        await this.releaseUserRunningTaskSlot(userId)
      }
      if (!queue.length) {
        delete this.queuedTasks[userId]
        this.stopQueueDrainIntervalIfIdle()
      }
    } finally {
      this.drainingUsers.delete(userId)
    }
  }

  private async claimUserRunningTaskSlot(userId: number): Promise<boolean> {
    const cacheKey = FilesTasksQueue.getUserRunningTasksCacheKey(userId)
    const runningTasks = await this.cache.increment(cacheKey, 1, CACHE_TASK_TTL)
    if (runningTasks <= this.maxRunningTasksPerUser) {
      return true
    }
    await this.releaseUserRunningTaskSlot(userId)
    return false
  }

  private async releaseUserRunningTaskSlot(userId: number): Promise<void> {
    const cacheKey = FilesTasksQueue.getUserRunningTasksCacheKey(userId)
    await this.cache.increment(cacheKey, -1, CACHE_TASK_TTL, 0)
  }

  private startQueueDrainInterval(): void {
    if (this.queuedTasksDrainInterval) return
    this.queuedTasksDrainInterval = setInterval(() => {
      this.drainAll().catch((e: Error) => this.logger.error({ tag: this.drainAll.name, msg: `${e}` }))
    }, this.drainInterval)
    this.queuedTasksDrainInterval.unref()
  }

  private stopQueueDrainIntervalIfIdle(): void {
    if (Object.keys(this.queuedTasks).length) return
    this.stop()
  }

  private async drainAll(): Promise<void> {
    for (const userId of Object.keys(this.queuedTasks)) {
      await this.drain(Number(userId))
    }
    this.stopQueueDrainIntervalIfIdle()
  }
}
