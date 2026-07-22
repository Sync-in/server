import { Test, TestingModule } from '@nestjs/testing'
import { FilesEventManager } from './files-event-manager.service'
import { Cache } from '../../../infrastructure/cache/cache.service'
import { ACTION } from '../../../common/constants'
import { FileEvent } from '../events/file-events'
import type { FileEventType } from '../interfaces/file-event.interface'
import { CACHE_QUOTA_TTL } from '../constants/cache'
import { CACHE_INDEXING_EVENT_TTL } from '../constants/indexing'
import { quotaCacheKeyFromSpace } from '../utils/quota'
import { indexingUpdateCacheKeysFromSpace } from '../utils/indexing'
import { configuration } from '../../../configuration/config.environment'
import type { Mock } from 'vitest'
import { FilesRecents } from './files-recents.service'

describe(FilesEventManager.name, () => {
  let service: FilesEventManager
  let cacheSetMock: Mock<(key: string, value: unknown, ttl?: number) => Promise<boolean>>
  let deleteRecentsMock: Mock
  let updateRecentFromEditorMock: Mock
  let contentIndexingEnabled: boolean

  const buildEvent = (props?: Partial<FileEventType>): FileEventType =>
    ({
      user: { id: 7, login: 'john' } as any,
      space: {
        id: 13,
        alias: 'project',
        url: 'files/project/document.bin',
        inTrashRepository: false,
        inPersonalSpace: false,
        inSharesRepository: false,
        root: {}
      } as any,
      action: ACTION.ADD,
      rPath: '/files/document.bin',
      ...props
    }) as FileEventType

  beforeEach(async () => {
    cacheSetMock = vi.fn().mockResolvedValue(true)
    deleteRecentsMock = vi.fn().mockResolvedValue(undefined)
    updateRecentFromEditorMock = vi.fn().mockResolvedValue(undefined)
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesEventManager,
        {
          provide: Cache,
          useValue: { set: cacheSetMock }
        },
        {
          provide: FilesRecents,
          useValue: { deleteRecents: deleteRecentsMock, updateRecentFromEditor: updateRecentFromEditorMock }
        }
      ]
    }).compile()

    module.useLogger(['fatal'])
    service = module.get<FilesEventManager>(FilesEventManager)
    contentIndexingEnabled = configuration.applications.files.contentIndexing.enabled
  })

  afterEach(async () => {
    configuration.applications.files.contentIndexing.enabled = contentIndexingEnabled
    await service.onModuleDestroy()
    vi.restoreAllMocks()
  })

  it('should cache a quota key once for duplicate non-delete events', async () => {
    const event = buildEvent({ rPath: '/files/document.tmp' })

    await (service as any).processEvents([event, { ...event, action: ACTION.UPDATE }])

    expect(cacheSetMock).toHaveBeenCalledTimes(1)
    expect(cacheSetMock).toHaveBeenCalledWith(quotaCacheKeyFromSpace(event.user.id, event.space, true), true, CACHE_QUOTA_TTL)
  })

  it('should delete recents before processing only the latest editor update per path', async () => {
    const callOrder: string[] = []
    deleteRecentsMock.mockImplementationOnce(async () => {
      callOrder.push('delete')
    })
    updateRecentFromEditorMock.mockImplementationOnce(async () => {
      callOrder.push('update')
    })
    const first = buildEvent({ action: ACTION.UPDATE, source: 'editor', rPath: '/files/first.bin' })
    const latest = { ...first, rPath: '/files/latest.bin' }

    await (service as any).processEvents([first, buildEvent({ action: ACTION.UPDATE }), buildEvent({ action: ACTION.DELETE }), latest])

    expect(deleteRecentsMock).toHaveBeenCalledWith([
      { userId: 7, spaceId: 13, inPersonalSpace: false, inSharesRepository: false, path: 'files/project/document.bin' }
    ])
    expect(updateRecentFromEditorMock).toHaveBeenCalledOnce()
    expect(updateRecentFromEditorMock).toHaveBeenCalledWith(latest.user, latest.space, latest.rPath)
    expect(callOrder).toEqual(['delete', 'update'])
  })

  it('should ignore recent deletion errors', async () => {
    deleteRecentsMock.mockRejectedValueOnce(new Error('database unavailable'))

    await expect((service as any).processEvents([buildEvent({ action: ACTION.DELETE })])).resolves.toBeUndefined()
  })

  it('should ignore quota cache update for delete events', async () => {
    await (service as any).processEvents([buildEvent({ action: ACTION.DELETE, rPath: '/files/deleted.tmp' })])

    expect(cacheSetMock).not.toHaveBeenCalled()
  })

  it('should ignore deletes from trash and shares list for recents', async () => {
    const event = buildEvent()
    await (service as any).processEvents([
      buildEvent({ action: ACTION.DELETE, space: { ...event.space, inTrashRepository: true } as any }),
      buildEvent({ action: ACTION.DELETE, space: { ...event.space, inSharesList: true } as any })
    ])

    expect(deleteRecentsMock).not.toHaveBeenCalled()
  })

  it('should cache quota and indexing keys for indexable files', async () => {
    configuration.applications.files.contentIndexing.enabled = true
    const event = buildEvent({
      rPath: '/shares/spec.pdf',
      space: {
        id: 42,
        alias: 'shared-space',
        inPersonalSpace: false,
        inSharesRepository: true,
        root: {}
      } as any
    })
    const quotaKey = quotaCacheKeyFromSpace(event.user.id, event.space, true)
    const indexingKeys = indexingUpdateCacheKeysFromSpace(event.user.id, event.space)

    await (service as any).processEvents([event])

    expect(cacheSetMock).toHaveBeenCalledTimes(1 + indexingKeys.length)
    expect(cacheSetMock).toHaveBeenCalledWith(quotaKey, true, CACHE_QUOTA_TTL)
    for (const key of indexingKeys) {
      expect(cacheSetMock).toHaveBeenCalledWith(key, true, CACHE_INDEXING_EVENT_TTL)
    }
  })

  it('should retry failed cache keys on the next flush', async () => {
    const event = buildEvent()
    const quotaKey = quotaCacheKeyFromSpace(event.user.id, event.space, true)
    cacheSetMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true)

    await (service as any).processEvents([event])
    await (service as any).processEvents([])

    expect(cacheSetMock).toHaveBeenNthCalledWith(1, quotaKey, true, CACHE_QUOTA_TTL)
    expect(cacheSetMock).toHaveBeenNthCalledWith(2, quotaKey, true, CACHE_QUOTA_TTL)
  })

  it('should flush buffered events and unsubscribe on module destroy', async () => {
    const event = buildEvent()
    const listenersBeforeDestroy = FileEvent.listenerCount('event')
    FileEvent.emit('event', event)

    await service.onModuleDestroy()

    expect(cacheSetMock).toHaveBeenCalledWith(quotaCacheKeyFromSpace(event.user.id, event.space, true), true, CACHE_QUOTA_TTL)
    expect(FileEvent.listenerCount('event')).toBe(listenersBeforeDestroy - 1)
    cacheSetMock.mockClear()

    FileEvent.emit('event', event)
    await (service as any).flushEvents()
    expect(cacheSetMock).not.toHaveBeenCalled()
  })

  it('should flush immediately when max buffer size is reached', async () => {
    ;(service as any).MAX_BUFFER_SIZE = 2
    const event = buildEvent()

    ;(service as any).onFileEvent(event)
    ;(service as any).onFileEvent(event)
    await new Promise((resolve) => setImmediate(resolve))

    expect(cacheSetMock).toHaveBeenCalledWith(quotaCacheKeyFromSpace(event.user.id, event.space, true), true, CACHE_QUOTA_TTL)
  })
})
