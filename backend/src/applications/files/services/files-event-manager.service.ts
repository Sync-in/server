import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { Cache } from '../../../infrastructure/cache/services/cache.service'
import { FileEvent } from '../events/file-events'
import { ACTION } from '../../../common/constants'
import type { FileEventType } from '../interfaces/file-event.interface'
import { CACHE_QUOTA_TTL } from '../constants/cache'
import { quotaCacheKeyFromSpace } from '../utils/quota'
import { getExtensionWithoutDot } from '../utils/files'
import { CACHE_INDEXING_EVENT_TTL, INDEXABLE_EXTENSIONS } from '../constants/indexing'
import { indexingUpdateCacheKeysFromSpace } from '../utils/indexing'
import { configuration } from '../../../configuration/config.environment'

@Injectable()
export class FilesEventManager implements OnModuleDestroy {
  /* Used to:
      - store cached events for storage usage updates
      - store indexing events for full-text index updates
      - todo: handle versioning
  */
  private readonly MAX_BUFFER_SIZE = 1_000
  private readonly MAX_BUFFER_DELAY_MS = 30_000
  private readonly logger = new Logger(FilesEventManager.name)
  private readonly eventsBuffer: FileEventType[] = []
  private quotaEvents: string[] = []
  private indexingEvents: string[] = []
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

  private readonly onFileEvent = (fEvent: FileEventType): void => {
    this.logger.verbose({
      tag: this.onFileEvent.name,
      msg: `Receiving: user:${fEvent.user.login} action:${fEvent.action} url:${fEvent.space.url}`
    })
    this.eventsBuffer.push(fEvent)
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

  private async processEvents(fEvents: FileEventType[]) {
    this.logger.verbose({ tag: this.processEvents.name, msg: `Processing ${fEvents.length} file event(s)` })
    for (const event of fEvents) {
      try {
        this.processQuotaEvent(event)
        if (configuration.applications.files.contentIndexing.enabled) {
          this.processIndexingEvent(event)
        }
      } catch (e) {
        this.logger.warn({ tag: this.processEvents.name, msg: `Could not process event: ${JSON.stringify(event)} - ${e}` })
      }
    }
    await this.storeEventsInCache()
  }

  private async storeEventsInCache() {
    const [failedQuotaKeys, failedIndexingKeys] = await Promise.all([
      this.cacheKeysWithTTL(this.quotaEvents, CACHE_QUOTA_TTL, 'quota'),
      this.cacheKeysWithTTL(this.indexingEvents, CACHE_INDEXING_EVENT_TTL, 'indexing')
    ])
    this.quotaEvents = failedQuotaKeys
    this.indexingEvents = failedIndexingKeys
  }

  private async cacheKeysWithTTL(events: string[], ttl: number, label: 'quota' | 'indexing'): Promise<string[]> {
    if (!events.length) {
      return []
    }

    const failedCacheKeys: string[] = []
    for (const cacheKey of events) {
      try {
        const ok = await this.cache.set(cacheKey, true, ttl)
        if (!ok) {
          failedCacheKeys.push(cacheKey)
        }
      } catch {
        failedCacheKeys.push(cacheKey)
      }
    }

    if (failedCacheKeys.length) {
      this.logger.warn({
        tag: this.cacheKeysWithTTL.name,
        msg: `Could not cache ${label} keys (${failedCacheKeys.length})`
      })
    }

    return failedCacheKeys
  }

  private processQuotaEvent(fEvent: FileEventType) {
    // Ignore files moved to the trash; storage usage remains unchanged.
    if (fEvent.action === ACTION.DELETE) return
    const cacheKey = quotaCacheKeyFromSpace(fEvent.user.id, fEvent.space, true)
    if (!cacheKey) {
      this.logger.warn({ tag: this.processQuotaEvent.name, msg: `Unable to determine space location: ${fEvent.space.id}` })
      return
    }
    if (this.quotaEvents.indexOf(cacheKey) === -1) {
      this.quotaEvents.push(cacheKey)
    }
  }

  private processIndexingEvent(fEvent: FileEventType) {
    const extension = getExtensionWithoutDot(fEvent.rPath)
    if (!INDEXABLE_EXTENSIONS.has(extension)) return null
    const cacheKeys = indexingUpdateCacheKeysFromSpace(fEvent.user.id, fEvent.space)
    if (!cacheKeys.length) {
      this.logger.warn({ tag: this.processIndexingEvent.name, msg: `Unable to determine space location: ${fEvent.space.id}` })
      return
    }
    for (const key of cacheKeys) {
      if (this.indexingEvents.indexOf(key) === -1) {
        this.indexingEvents.push(key)
      }
    }
  }
}
