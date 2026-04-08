import { Test, TestingModule } from '@nestjs/testing'
import { FilesQuotaManager } from './files-quota-manager.service'
import { SpacesQueries } from '../../spaces/services/spaces-queries.service'
import { UsersQueries } from '../../users/services/users-queries.service'
import { SharesQueries } from '../../shares/services/shares-queries.service'
import { CACHE_QUOTA_TTL } from '../constants/cache'
import { FILE_REPOSITORY } from '../constants/operations'
import { genQuotaCacheKey } from '../utils/quota'
import { SpaceModel } from '../../spaces/models/space.model'
import * as filesUtils from '../utils/files'

describe(FilesQuotaManager.name, () => {
  let service: FilesQuotaManager
  let spacesQueries: {
    cache: {
      get: jest.Mock
      set: jest.Mock
      del: jest.Mock
      keys: jest.Mock
    }
    spacesQuotaPaths: jest.Mock
    updateSpace: jest.Mock
  }
  let usersQueries: {
    selectUsers: jest.Mock
    updateUserOrGuest: jest.Mock
  }
  let sharesQueries: {
    cache: {
      set: jest.Mock
    }
    sharesQuotaExternalPaths: jest.Mock
    updateShare: jest.Mock
  }
  let isPathExistsSpy: jest.SpiedFunction<typeof filesUtils.isPathExists>
  let dirSizeSpy: jest.SpiedFunction<typeof filesUtils.dirSize>

  beforeEach(async () => {
    spacesQueries = {
      cache: {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue(true),
        del: jest.fn().mockResolvedValue(true),
        keys: jest.fn().mockResolvedValue([])
      },
      spacesQuotaPaths: jest.fn().mockResolvedValue([]),
      updateSpace: jest.fn().mockResolvedValue(true)
    }
    usersQueries = {
      selectUsers: jest.fn().mockResolvedValue([]),
      updateUserOrGuest: jest.fn().mockResolvedValue(true)
    }
    sharesQueries = {
      cache: {
        set: jest.fn().mockResolvedValue(true)
      },
      sharesQuotaExternalPaths: jest.fn().mockResolvedValue([]),
      updateShare: jest.fn().mockResolvedValue(true)
    }
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesQuotaManager,
        { provide: SpacesQueries, useValue: spacesQueries },
        { provide: UsersQueries, useValue: usersQueries },
        { provide: SharesQueries, useValue: sharesQueries }
      ]
    }).compile()

    module.useLogger(['fatal'])
    service = module.get<FilesQuotaManager>(FilesQuotaManager)
    isPathExistsSpy = jest.spyOn(filesUtils, 'isPathExists').mockResolvedValue(true)
    dirSizeSpy = jest.spyOn(filesUtils, 'dirSize').mockResolvedValue([0, {}])
  })

  afterEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  it('should skip quota update when the space is a shares list', async () => {
    const user = { id: 3 } as any
    const space = { id: 10, alias: 'shares', inSharesList: true } as any

    await service.setQuotaExceeded(user, space)

    expect(spacesQueries.cache.get).not.toHaveBeenCalled()
  })

  it('should set quota from cache when available', async () => {
    const user = { id: 3 } as any
    const space = { id: 10, alias: 'project', inSharesList: false, inPersonalSpace: false, inSharesRepository: false } as any
    const cachedQuota = { storageUsage: 12, storageQuota: 10 }
    spacesQueries.cache.get.mockResolvedValueOnce(cachedQuota)

    await service.setQuotaExceeded(user, space)

    expect(spacesQueries.cache.get).toHaveBeenCalledWith(genQuotaCacheKey(10, FILE_REPOSITORY.SPACE))
    expect(space.storageUsage).toBe(12)
    expect(space.storageQuota).toBe(10)
    expect(space.quotaIsExceeded).toBe(true)
  })

  it('should compute personal quota when cache is missing', async () => {
    const user = { id: 7 } as any
    const space = { id: 0, alias: 'personal', inSharesList: false, inPersonalSpace: true, inSharesRepository: false } as any
    const personalQuota = { storageUsage: 20, storageQuota: 100 }
    const spy = jest.spyOn(service, 'updatePersonalSpacesQuota').mockResolvedValueOnce(personalQuota)

    await service.setQuotaExceeded(user, space)

    expect(spy).toHaveBeenCalledWith(7)
    expect(space.storageUsage).toBe(20)
    expect(space.storageQuota).toBe(100)
    expect(space.quotaIsExceeded).toBe(false)
  })

  it('should dispatch storage usage updates by repository type and clean cache keys', async () => {
    spacesQueries.cache.keys.mockResolvedValueOnce([
      'event-update-quota-user-1',
      'event-update-quota-space-2',
      'event-update-quota-share-3',
      'event-update-quota-unknown-4'
    ])
    const userSpy = jest.spyOn(service, 'updatePersonalSpacesQuota').mockResolvedValueOnce(undefined)
    const spaceSpy = jest.spyOn(service, 'updateSpacesQuota').mockResolvedValueOnce(undefined)
    const shareSpy = jest.spyOn(service, 'updateSharesExternalPathQuota').mockResolvedValueOnce(undefined)

    await service.updateStorageUsageEntries()

    expect(userSpy).toHaveBeenCalledWith(1)
    expect(spaceSpy).toHaveBeenCalledWith(2)
    expect(shareSpy).toHaveBeenCalledWith(3)
    expect(spacesQueries.cache.del).toHaveBeenCalledTimes(4)
    expect(spacesQueries.cache.del).toHaveBeenCalledWith('event-update-quota-user-1')
    expect(spacesQueries.cache.del).toHaveBeenCalledWith('event-update-quota-space-2')
    expect(spacesQueries.cache.del).toHaveBeenCalledWith('event-update-quota-share-3')
    expect(spacesQueries.cache.del).toHaveBeenCalledWith('event-update-quota-unknown-4')
  })

  it('should update cached storage quota when current usage is already cached', async () => {
    spacesQueries.cache.get.mockResolvedValueOnce({ storageUsage: 55, storageQuota: 80 })

    await service.updateStorageQuota(9, FILE_REPOSITORY.SPACE, 100)

    expect(spacesQueries.cache.set).toHaveBeenCalledWith(
      genQuotaCacheKey(9, FILE_REPOSITORY.SPACE),
      { storageUsage: 55, storageQuota: 100 },
      CACHE_QUOTA_TTL
    )
  })

  it('should enqueue a quota update event when cached usage is missing', async () => {
    spacesQueries.cache.get.mockResolvedValueOnce(null)

    await service.updateStorageQuota(9, FILE_REPOSITORY.SPACE, 100)

    expect(spacesQueries.cache.set).toHaveBeenCalledWith(genQuotaCacheKey(9, FILE_REPOSITORY.SPACE, true), true, CACHE_QUOTA_TTL)
  })

  it('should compute personal quota from filesystem and return it for a specific user', async () => {
    usersQueries.selectUsers.mockResolvedValueOnce([{ id: 5, login: 'john', storageUsage: 2, storageQuota: 50 }])
    dirSizeSpy.mockResolvedValueOnce([42, {}])

    const quota = await service.updatePersonalSpacesQuota(5)

    expect(isPathExistsSpy).toHaveBeenCalled()
    expect(quota).toEqual({ storageUsage: 42, storageQuota: 50 })
    expect(spacesQueries.cache.set).toHaveBeenCalledWith(genQuotaCacheKey(5, FILE_REPOSITORY.USER), quota, CACHE_QUOTA_TTL)
    expect(usersQueries.updateUserOrGuest).toHaveBeenCalledWith(5, { storageUsage: 42 })
  })

  it('should compute space quota from home path and external paths', async () => {
    spacesQueries.spacesQuotaPaths.mockResolvedValueOnce([
      { id: 8, alias: 'engineering', storageUsage: 1, storageQuota: 500, externalPaths: ['/mnt/ext-space', null] }
    ])
    dirSizeSpy.mockResolvedValueOnce([30, {}]).mockResolvedValueOnce([5, {}])

    const quota = await service.updateSpacesQuota(8)

    expect(isPathExistsSpy).toHaveBeenCalledWith(SpaceModel.getHomePath('engineering'))
    expect(quota).toEqual({ storageUsage: 35, storageQuota: 500 })
    expect(spacesQueries.cache.set).toHaveBeenCalledWith(genQuotaCacheKey(8, FILE_REPOSITORY.SPACE), quota, CACHE_QUOTA_TTL)
    expect(spacesQueries.updateSpace).toHaveBeenCalledWith(8, { storageUsage: 35 })
  })

  it('should compute share external path quota and persist usage change', async () => {
    sharesQueries.sharesQuotaExternalPaths.mockResolvedValueOnce([
      { id: 12, alias: 'share-1', externalPath: '/mnt/share', storageUsage: 2, storageQuota: 10 }
    ])
    dirSizeSpy.mockResolvedValueOnce([7, {}])

    const quota = await service.updateSharesExternalPathQuota(12)

    expect(isPathExistsSpy).toHaveBeenCalledWith('/mnt/share')
    expect(quota).toEqual({ storageUsage: 7, storageQuota: 10 })
    expect(sharesQueries.cache.set).toHaveBeenCalledWith(genQuotaCacheKey(12, FILE_REPOSITORY.SHARE), quota, CACHE_QUOTA_TTL)
    expect(sharesQueries.updateShare).toHaveBeenCalledWith(12, { storageUsage: 7 })
  })
})
