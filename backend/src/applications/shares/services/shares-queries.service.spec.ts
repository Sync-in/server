import 'reflect-metadata'
import type { Cache } from '../../../infrastructure/cache/cache.service'
import { SharesQueries } from './shares-queries.service'

interface CacheMock {
  genSlugKey: ReturnType<typeof vi.fn>
  get: ReturnType<typeof vi.fn>
  set: ReturnType<typeof vi.fn>
}

describe(SharesQueries.name, () => {
  let cache: CacheMock
  let service: SharesQueries
  let execute: ReturnType<typeof vi.fn>

  beforeEach(() => {
    cache = {
      genSlugKey: vi.fn(() => 'share-permissions'),
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(undefined)
    }
    execute = vi.fn()
    service = new SharesQueries({} as any, cache as unknown as Cache)
    Reflect.set(service, 'sharePermissionsQuery', { execute })
  })

  afterEach(() => vi.restoreAllMocks())

  it('uses the external root selected by the permissions query without another lookup', async () => {
    execute.mockResolvedValue([
      {
        id: 30,
        alias: 'grandchild',
        permissions: 'd:r',
        root: {
          externalPath: '/mnt/archive',
          externalParentShareId: 10
        }
      }
    ])
    const findHighestParentShare = vi.spyOn(service, 'findHighestParentShare')

    const result = await service.permissions(7, 'grandchild')

    expect(findHighestParentShare).not.toHaveBeenCalled()
    expect(result.root.externalParentShareId).toBe(10)
    expect(result.permissions).toBe('d:r')
  })

  it('returns no permissions when the query rejects an unresolved external hierarchy', async () => {
    execute.mockResolvedValue([])
    const findHighestParentShare = vi.spyOn(service, 'findHighestParentShare')

    await expect(service.permissions(7, 'grandchild')).resolves.toBeUndefined()
    expect(findHighestParentShare).not.toHaveBeenCalled()
  })
})
