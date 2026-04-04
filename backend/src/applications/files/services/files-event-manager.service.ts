import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { Cache } from '../../../infrastructure/cache/services/cache.service'
import { FileEvent } from '../events/file-events'
import { ACTION } from '../../../common/constants'
import type { FileEventType } from '../interfaces/file-event.interface'
import { CACHE_QUOTA_TTL } from '../constants/cache'
import { quotaCacheKeyFromSpace } from '../utils/quota'

@Injectable()
export class FilesEventManager implements OnModuleDestroy {
  /* Used to:
      - process cache events (storage usage updates, new file indexing) in the main worker
      - handle versioning
  */
  private readonly MAX_BUFFER_SIZE = 1_000
  private readonly MAX_BUFFER_DELAY_MS = 20_000
  private readonly logger = new Logger(FilesEventManager.name)
  private readonly eventsBuffer: FileEventType[] = []
  private quotaEvents: string[] = []
  private flushTimer: NodeJS.Timeout | null = null
  private isFlushing = false
  private flushRequested = false

  constructor(private readonly cache: Cache) {
    FileEvent.on('event', this.onFileEvent)
  }

  async onModuleDestroy(): Promise<void> {
    FileEvent.off('event', this.onFileEvent)
    this.clearFlushTimer()
    await this.flushEvents()
  }

  private readonly onFileEvent = (fileEvent: FileEventType): void => {
    this.logger.verbose({
      tag: this.processEvents.name,
      msg: `Receiving: user:${fileEvent.user.login} action:${fileEvent.action} repository:${fileEvent.space.alias}`
    })
    this.eventsBuffer.push(fileEvent)
    if (this.eventsBuffer.length >= this.MAX_BUFFER_SIZE) {
      void this.flushEvents()
      return
    }
    this.startFlushTimer()
  }

  private startFlushTimer(): void {
    if (this.flushTimer) {
      return
    }
    this.flushTimer = setTimeout(() => void this.flushEvents(), this.MAX_BUFFER_DELAY_MS)
  }

  private clearFlushTimer(): void {
    if (!this.flushTimer) {
      return
    }
    clearTimeout(this.flushTimer)
    this.flushTimer = null
  }

  private async flushEvents() {
    this.clearFlushTimer()
    if (this.isFlushing) {
      this.flushRequested = true
      return
    }
    if (!this.eventsBuffer.length) {
      return
    }
    this.isFlushing = true
    const events = this.eventsBuffer.splice(0, this.eventsBuffer.length)
    try {
      await this.processEvents(events)
    } catch (e) {
      this.logger.error({ tag: this.flushEvents.name, msg: `Could not process buffered events: ${e}` })
      this.eventsBuffer.unshift(...events)
    } finally {
      this.isFlushing = false
    }
    if (this.eventsBuffer.length >= this.MAX_BUFFER_SIZE || this.flushRequested) {
      this.flushRequested = false
      await this.flushEvents()
      return
    }
    if (this.eventsBuffer.length) {
      this.startFlushTimer()
    }
  }

  private async processEvents(fileEvents: FileEventType[]) {
    this.logger.verbose({ tag: this.processEvents.name, msg: `Processing ${fileEvents.length} file event(s)` })
    for (const event of fileEvents) {
      try {
        this.processQuotaEvent(event)
      } catch (e) {
        this.logger.warn({ tag: this.processEvents.name, msg: `Could not process quota event: ${JSON.stringify(event)} - ${e}` })
      }
    }
    await this.storeEventsInCache()
  }

  private async storeEventsInCache() {
    if (!this.quotaEvents.length) return
    const failedCacheKeys: string[] = []
    await Promise.all(
      this.quotaEvents.map(async (cacheKey) => {
        try {
          const ok = await this.cache.set(cacheKey, true, CACHE_QUOTA_TTL)
          if (!ok) {
            failedCacheKeys.push(cacheKey)
          }
        } catch {
          failedCacheKeys.push(cacheKey)
        }
      })
    )
    if (failedCacheKeys.length) {
      this.logger.warn({
        tag: this.storeEventsInCache.name,
        msg: `Could not cache quota keys (${failedCacheKeys.length})`
      })
    }
    this.quotaEvents = failedCacheKeys
  }

  private processQuotaEvent(fileEvent: FileEventType) {
    // Ignore files moved to the trash; storage usage remains unchanged.
    if (fileEvent.action === ACTION.DELETE) return
    const cacheKey = quotaCacheKeyFromSpace(fileEvent.user.id, fileEvent.space, true)
    if (!cacheKey) {
      this.logger.warn({ tag: this.processQuotaEvent.name, msg: `Unable to determine space location: ${fileEvent.space.id}` })
      return
    }
    if (this.quotaEvents.indexOf(cacheKey) === -1) {
      this.quotaEvents.push(cacheKey)
    }
  }
}
