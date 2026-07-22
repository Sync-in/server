import { Test, TestingModule } from '@nestjs/testing'
import { convertHumanTimeToMs } from '../../../common/functions'
import { currentTimeStamp } from '../../../common/shared'
import { SharesQueries } from '../../shares/services/shares-queries.service'
import { SpacesQueries } from '../../spaces/services/spaces-queries.service'
import { USER_PERMISSION } from '../../users/constants/user'
import { FilesQueries } from './files-queries.service'
import { FilesRecents } from './files-recents.service'
import type { Mock } from 'vitest'
import * as filesUtils from '../utils/files'

describe(FilesRecents.name, () => {
  let service: FilesRecents
  let filesQueries: {
    getRecentsFromUser: Mock
    getRecentsFromLocation: Mock
    deleteRecents: Mock
    replaceRecents: Mock
    updateRecents: Mock
    getSpaceFileId: Mock
    upsertRecent: Mock
  }
  let spacesQueries: {
    spaceIds: Mock
  }
  let sharesQueries: {
    shareIds: Mock
  }

  beforeEach(async () => {
    filesQueries = {
      getRecentsFromUser: vi.fn().mockResolvedValue([]),
      getRecentsFromLocation: vi.fn().mockResolvedValue([]),
      deleteRecents: vi.fn().mockResolvedValue(undefined),
      replaceRecents: vi.fn().mockResolvedValue(undefined),
      updateRecents: vi.fn().mockResolvedValue(undefined),
      getSpaceFileId: vi.fn().mockResolvedValue(undefined),
      upsertRecent: vi.fn().mockResolvedValue(undefined)
    }
    spacesQueries = {
      spaceIds: vi.fn().mockResolvedValue([])
    }
    sharesQueries = {
      shareIds: vi.fn().mockResolvedValue([])
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
    vi.restoreAllMocks()
  })

  const userWithPermissions = (applications: USER_PERMISSION[] = [], props: Record<string, any> = {}) =>
    ({
      id: 7,
      isAdmin: false,
      applications,
      havePermission: (permission: USER_PERMISSION) => Boolean(props.isAdmin) || applications.includes(permission),
      ...props
    }) as any

  it('should load recents from user accessible spaces and shares', async () => {
    const recents = [{ id: 1, name: 'a.txt' }]
    spacesQueries.spaceIds.mockResolvedValueOnce([10, 11])
    sharesQueries.shareIds.mockResolvedValueOnce([20])
    filesQueries.getRecentsFromUser.mockResolvedValueOnce(recents)

    const result = await service.getRecents(
      userWithPermissions([USER_PERMISSION.PERSONAL_SPACE, USER_PERMISSION.SPACES, USER_PERMISSION.SHARES], { isAdmin: true }),
      25
    )

    expect(spacesQueries.spaceIds).toHaveBeenCalledWith(7)
    expect(sharesQueries.shareIds).toHaveBeenCalledWith(7, 1)
    expect(filesQueries.getRecentsFromUser).toHaveBeenCalledWith(7, [10, 11], [20], 25)
    expect(result).toBe(recents)
  })

  it('should only load personal recents when user only has personal space permission', async () => {
    await service.getRecents(userWithPermissions([USER_PERMISSION.PERSONAL_SPACE]), 10)

    expect(spacesQueries.spaceIds).not.toHaveBeenCalled()
    expect(sharesQueries.shareIds).not.toHaveBeenCalled()
    expect(filesQueries.getRecentsFromUser).toHaveBeenCalledWith(7, [], [], 10)
  })

  it('should only load space recents when user only has spaces permission', async () => {
    spacesQueries.spaceIds.mockResolvedValueOnce([10])

    await service.getRecents(userWithPermissions([USER_PERMISSION.SPACES]), 10)

    expect(spacesQueries.spaceIds).toHaveBeenCalledWith(7)
    expect(sharesQueries.shareIds).not.toHaveBeenCalled()
    expect(filesQueries.getRecentsFromUser).toHaveBeenCalledWith(undefined, [10], [], 10)
  })

  it('should only load share recents when user only has shares permission', async () => {
    sharesQueries.shareIds.mockResolvedValueOnce([20])

    await service.getRecents(userWithPermissions([USER_PERMISSION.SHARES]), 10)

    expect(spacesQueries.spaceIds).not.toHaveBeenCalled()
    expect(sharesQueries.shareIds).toHaveBeenCalledWith(7, 0)
    expect(filesQueries.getRecentsFromUser).toHaveBeenCalledWith(undefined, [], [20], 10)
  })

  it('should not load any recents source without matching permission', async () => {
    await service.getRecents(userWithPermissions(), 10)

    expect(spacesQueries.spaceIds).not.toHaveBeenCalled()
    expect(sharesQueries.shareIds).not.toHaveBeenCalled()
    expect(filesQueries.getRecentsFromUser).toHaveBeenCalledWith(undefined, [], [], 10)
  })

  it('should ignore updateRecents when browsing trash repository', async () => {
    await service.updateRecents({ id: 5 } as any, { inTrashRepository: true, url: 'trash/personal' } as any, [])

    expect(filesQueries.getRecentsFromLocation).not.toHaveBeenCalled()
    expect(filesQueries.updateRecents).not.toHaveBeenCalled()
  })

  it('should normalize and map recent deletions to their repositories', async () => {
    await service.deleteRecents([
      { userId: 5, spaceId: 0, inPersonalSpace: true, inSharesRepository: false, path: 'files/personal/docs/../old.txt' },
      { userId: 5, spaceId: 9, inPersonalSpace: false, inSharesRepository: false, path: 'files/project/archive' },
      { userId: 5, spaceId: 12, inPersonalSpace: false, inSharesRepository: true, path: 'shares/project/report.pdf' }
    ])

    expect(filesQueries.deleteRecents).toHaveBeenCalledWith([
      { ownerId: 5, path: 'files/personal/old.txt' },
      { spaceId: 9, path: 'files/project/archive' },
      { shareId: 12, path: 'shares/project/report.pdf' }
    ])
  })

  it('should stat and upsert one recent file after an editor update', async () => {
    const now = currentTimeStamp(null, true)
    const file = {
      id: -123,
      path: 'docs',
      name: 'report.txt',
      isDir: false,
      size: 42,
      ctime: now,
      mtime: now,
      mime: 'text/plain'
    }
    const user = { id: 5 } as any
    const space = {
      id: 9,
      url: 'files/project/docs/report.txt',
      dbFile: { spaceId: 9, path: 'docs/report.txt', inTrash: false },
      inTrashRepository: false,
      inSharesList: false,
      inPersonalSpace: false,
      inSharesRepository: false
    } as any
    vi.spyOn(filesUtils, 'getProps').mockResolvedValueOnce(file as any)
    filesQueries.getSpaceFileId.mockResolvedValueOnce(321)

    await service.updateRecentFromEditor(user, space, '/data/project/docs/report.txt')

    expect(filesUtils.getProps).toHaveBeenCalledWith('/data/project/docs/report.txt', 'docs/report.txt')
    expect(filesQueries.getSpaceFileId).toHaveBeenCalledWith(file, space.dbFile, { withDir: false })
    expect(filesQueries.upsertRecent).toHaveBeenCalledWith(
      { spaceId: 9, path: 'files/project/docs' },
      { id: 321, spaceId: 9, path: 'files/project/docs', name: 'report.txt', mtime: now, mime: 'text/plain' }
    )
  })

  it('should ignore an old file after an editor update', async () => {
    vi.spyOn(filesUtils, 'getProps').mockResolvedValueOnce({
      id: -123,
      path: 'docs',
      name: 'old.txt',
      isDir: false,
      size: 42,
      ctime: 0,
      mtime: currentTimeStamp(null, true) - convertHumanTimeToMs('30d'),
      mime: 'text/plain'
    } as any)

    await service.updateRecentFromEditor(
      { id: 5 } as any,
      {
        id: 0,
        url: 'files/personal/docs/old.txt',
        dbFile: { ownerId: 5, path: 'docs/old.txt', inTrash: false },
        inTrashRepository: false,
        inSharesList: false,
        inPersonalSpace: true,
        inSharesRepository: false
      } as any,
      '/data/users/john/files/docs/old.txt'
    )

    expect(filesQueries.getSpaceFileId).not.toHaveBeenCalled()
    expect(filesQueries.upsertRecent).not.toHaveBeenCalled()
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
      { id: 101, name: 'old-name.txt', mtime: now - 1000, mime: 'text-plain', ...location },
      { id: 102, name: 'remove-me.txt', mtime: now - 1000, mime: 'text-plain', ...location }
    ]
    const fsFiles = [
      { id: 101, name: 'new-name.txt', isDir: false, size: 100, mtime: now, mime: 'application-pdf' },
      { id: 103, name: 'add-me.txt', isDir: false, size: 200, mtime: now, mime: 'text-plain' }
    ]
    filesQueries.getRecentsFromLocation.mockResolvedValueOnce(dbRecents)

    await service.updateRecents({ id: 5 } as any, { inTrashRepository: false, inPersonalSpace: true, url: location.path } as any, fsFiles as any)

    expect(filesQueries.getRecentsFromLocation).toHaveBeenCalledWith(location)
    expect(filesQueries.updateRecents).toHaveBeenCalledTimes(1)
    const [actualLocation, toAdd, toUpdate, toRemove] = filesQueries.updateRecents.mock.calls[0]
    expect(actualLocation).toEqual(location)
    expect(toAdd).toEqual([{ id: 103, name: 'add-me.txt', mtime: now, mime: 'text-plain', ...location }])
    expect(toUpdate).toEqual([{ id: 101, name: 'new-name.txt', mtime: now, mime: 'application-pdf' }])
    expect(toRemove).toEqual([102])
  })

  it('should replace the shares snapshot and deduplicate by file id', async () => {
    const now = currentTimeStamp(null, true)
    const space = { inTrashRepository: false, inSharesList: true, inSharesRepository: false, inPersonalSpace: false, id: 0, url: 'shares' } as any
    const files = [
      { id: 10, name: 'report.pdf', isDir: false, size: 5, mtime: now, mime: 'application-pdf', root: { id: 101 } },
      { id: 10, name: 'report.pdf', isDir: false, size: 5, mtime: now, mime: 'application-pdf', root: { id: 102 } }
    ]
    await service.updateRecents({ id: 5 } as any, space, files as any)

    expect(filesQueries.getRecentsFromLocation).not.toHaveBeenCalled()
    expect(filesQueries.updateRecents).not.toHaveBeenCalled()
    expect(filesQueries.replaceRecents).toHaveBeenCalledWith({ shareId: [101, 102], path: 'shares' }, [
      { id: 10, name: 'report.pdf', mtime: now, mime: 'application-pdf', path: 'shares', shareId: 102 }
    ])
  })

  it('should use repository share id for a single share location', async () => {
    const now = currentTimeStamp(null, true)

    await service.updateRecents(
      { id: 5 } as any,
      { inTrashRepository: false, inSharesList: false, inSharesRepository: true, inPersonalSpace: false, id: 77, url: 'shares/project' } as any,
      [{ id: 1, name: 'doc.txt', isDir: false, size: 1, mtime: now, mime: 'text-plain' }] as any
    )

    expect(filesQueries.getRecentsFromLocation).toHaveBeenCalledWith({ shareId: 77, path: 'shares/project' })
  })

  it('should use space id location for regular space repository', async () => {
    const now = currentTimeStamp(null, true)

    await service.updateRecents(
      { id: 5 } as any,
      { inTrashRepository: false, inSharesList: false, inSharesRepository: false, inPersonalSpace: false, id: 44, url: 'files/engineering' } as any,
      [{ id: 1, name: 'doc.txt', isDir: false, size: 1, mtime: now, mime: 'text-plain' }] as any
    )

    expect(filesQueries.getRecentsFromLocation).toHaveBeenCalledWith({ spaceId: 44, path: 'files/engineering' })
  })
})
