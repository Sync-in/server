import { Test, TestingModule } from '@nestjs/testing'
import { convertHumanTimeToMs } from '../../../common/functions'
import { currentTimeStamp } from '../../../common/shared'
import { SharesQueries } from '../../shares/services/shares-queries.service'
import { SpacesQueries } from '../../spaces/services/spaces-queries.service'
import { FilesQueries } from './files-queries.service'
import { FilesRecents } from './files-recents.service'

describe(FilesRecents.name, () => {
  let service: FilesRecents
  let filesQueries: {
    getRecentsFromUser: jest.Mock
    getRecentsFromLocation: jest.Mock
    updateRecents: jest.Mock
  }
  let spacesQueries: {
    spaceIds: jest.Mock
  }
  let sharesQueries: {
    shareIds: jest.Mock
  }

  beforeEach(async () => {
    filesQueries = {
      getRecentsFromUser: jest.fn().mockResolvedValue([]),
      getRecentsFromLocation: jest.fn().mockResolvedValue([]),
      updateRecents: jest.fn().mockResolvedValue(undefined)
    }
    spacesQueries = {
      spaceIds: jest.fn().mockResolvedValue([])
    }
    sharesQueries = {
      shareIds: jest.fn().mockResolvedValue([])
    }
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesRecents,
        { provide: FilesQueries, useValue: filesQueries },
        { provide: SpacesQueries, useValue: spacesQueries },
        {
          provide: SharesQueries,
          useValue: sharesQueries
        }
      ]
    }).compile()

    module.useLogger(['fatal'])
    service = module.get<FilesRecents>(FilesRecents)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  it('should load recents from user accessible spaces and shares', async () => {
    const recents = [{ id: 1, name: 'a.txt' }]
    spacesQueries.spaceIds.mockResolvedValueOnce([10, 11])
    sharesQueries.shareIds.mockResolvedValueOnce([20])
    filesQueries.getRecentsFromUser.mockResolvedValueOnce(recents)

    const result = await service.getRecents({ id: 7, isAdmin: true } as any, 25)

    expect(spacesQueries.spaceIds).toHaveBeenCalledWith(7)
    expect(sharesQueries.shareIds).toHaveBeenCalledWith(7, 1)
    expect(filesQueries.getRecentsFromUser).toHaveBeenCalledWith(7, [10, 11], [20], 25)
    expect(result).toBe(recents)
  })

  it('should ignore updateRecents when browsing trash repository', async () => {
    await service.updateRecents({ id: 5 } as any, { inTrashRepository: true, url: 'trash/personal' } as any, [])

    expect(filesQueries.getRecentsFromLocation).not.toHaveBeenCalled()
    expect(filesQueries.updateRecents).not.toHaveBeenCalled()
  })

  it('should skip persistence when filtered fs recents and db recents are both empty', async () => {
    const oldMtime = currentTimeStamp(null, true) - convertHumanTimeToMs('30d')
    const files = [
      { id: 1, name: 'dir', isDir: true, size: 1, mtime: currentTimeStamp(null, true), mime: 'directory' },
      { id: 2, name: 'zero.txt', isDir: false, size: 0, mtime: currentTimeStamp(null, true), mime: 'text-plain' },
      { id: 3, name: 'old.txt', isDir: false, size: 10, mtime: oldMtime, mime: 'text-plain' }
    ] as any

    await service.updateRecents({ id: 5 } as any, { inTrashRepository: false, inPersonalSpace: true, url: 'files/personal/docs' } as any, files)

    expect(filesQueries.getRecentsFromLocation).toHaveBeenCalledWith({ ownerId: 5, path: 'files/personal/docs' })
    expect(filesQueries.updateRecents).not.toHaveBeenCalled()
  })

  it('should compute add update remove diff and persist recents for personal space', async () => {
    const now = currentTimeStamp(null, true)
    const location = { ownerId: 5, path: 'files/personal/docs' }
    const dbRecents = [
      { id: 1, name: 'old-name.txt', mtime: now - 1000, mime: 'text-plain' },
      { id: 2, name: 'remove-me.txt', mtime: now - 1000, mime: 'text-plain' }
    ]
    const fsFiles = [
      { id: 1, name: 'new-name.txt', isDir: false, size: 100, mtime: now, mime: 'text-plain' },
      { id: 3, name: 'add-me.txt', isDir: false, size: 200, mtime: now, mime: 'text-plain' }
    ]
    filesQueries.getRecentsFromLocation.mockResolvedValueOnce(dbRecents)

    await service.updateRecents({ id: 5 } as any, { inTrashRepository: false, inPersonalSpace: true, url: location.path } as any, fsFiles as any)

    expect(filesQueries.getRecentsFromLocation).toHaveBeenCalledWith(location)
    expect(filesQueries.updateRecents).toHaveBeenCalledTimes(1)
    const [loc, toAdd, toUpdate, toRemove] = filesQueries.updateRecents.mock.calls[0]
    expect(loc).toEqual(location)
    expect(toAdd).toEqual([{ id: 3, name: 'add-me.txt', mtime: now, mime: 'text-plain', ...location }])
    expect(toUpdate).toEqual([{ name: 'new-name.txt', mtime: now, object: fsFiles[0] }])
    expect(toRemove).toEqual([2])
  })

  it('should use share location list and per-file share id when browsing shares list', async () => {
    const now = currentTimeStamp(null, true)
    const files = [
      { id: 10, name: 'a.txt', isDir: false, size: 5, mtime: now, mime: 'text-plain', root: { id: 101 } },
      { id: 11, name: 'b.txt', isDir: false, size: 5, mtime: now, mime: 'text-plain', root: { id: 102 } }
    ]
    filesQueries.getRecentsFromLocation.mockResolvedValueOnce([])

    await service.updateRecents(
      { id: 5 } as any,
      { inTrashRepository: false, inSharesList: true, inSharesRepository: false, inPersonalSpace: false, id: 0, url: 'shares' } as any,
      files as any
    )

    const [location, toAdd] = filesQueries.updateRecents.mock.calls[0]
    expect(location).toEqual({ shareId: [101, 102], path: 'shares' })
    expect(toAdd).toEqual([
      { id: 10, name: 'a.txt', mtime: now, mime: 'text-plain', path: 'shares', shareId: 101 },
      { id: 11, name: 'b.txt', mtime: now, mime: 'text-plain', path: 'shares', shareId: 102 }
    ])
  })

  it('should use repository share id for a single share location', async () => {
    const now = currentTimeStamp(null, true)
    filesQueries.getRecentsFromLocation.mockResolvedValueOnce([])

    await service.updateRecents(
      { id: 5 } as any,
      { inTrashRepository: false, inSharesList: false, inSharesRepository: true, inPersonalSpace: false, id: 77, url: 'shares/project' } as any,
      [{ id: 1, name: 'doc.txt', isDir: false, size: 1, mtime: now, mime: 'text-plain' }] as any
    )

    expect(filesQueries.getRecentsFromLocation).toHaveBeenCalledWith({ shareId: 77, path: 'shares/project' })
  })

  it('should use space id location for regular space repository', async () => {
    const now = currentTimeStamp(null, true)
    filesQueries.getRecentsFromLocation.mockResolvedValueOnce([])

    await service.updateRecents(
      { id: 5 } as any,
      { inTrashRepository: false, inSharesList: false, inSharesRepository: false, inPersonalSpace: false, id: 44, url: 'files/engineering' } as any,
      [{ id: 1, name: 'doc.txt', isDir: false, size: 1, mtime: now, mime: 'text-plain' }] as any
    )

    expect(filesQueries.getRecentsFromLocation).toHaveBeenCalledWith({ spaceId: 44, path: 'files/engineering' })
  })
})
