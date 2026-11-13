import { Test, TestingModule } from '@nestjs/testing'
import fs from 'node:fs/promises'
import { Cache } from '../../../infrastructure/cache/cache.service.js'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants.js'
import { FilesQuotaManager } from '../../files/services/files-quota-manager.service.js'
import { FilesLockManager } from '../../files/services/files-lock-manager.service.js'
import { FilesQueries } from '../../files/services/files-queries.service.js'
import { FilesRecents } from '../../files/services/files-recents.service.js'
import { LinksQueries } from '../../links/services/links-queries.service.js'
import { NotificationsManager } from '../../notifications/services/notifications-manager.service.js'
import { SharesManager } from '../../shares/services/shares-manager.service.js'
import { SharesQueries } from '../../shares/services/shares-queries.service.js'
import type { UserModel } from '../../users/models/user.model.js'
import { UsersQueries } from '../../users/services/users-queries.service.js'
import type { SpaceEnv } from '../models/space-env.model.js'
import { SpacesBrowser } from './spaces-browser.service.js'
import { SpacesManager } from './spaces-manager.service.js'
import { SpacesQueries } from './spaces-queries.service.js'

describe(SpacesBrowser.name, () => {
  let spacesBrowserService: SpacesBrowser
  const directoryStats = {
    ino: 1,
    size: 0,
    birthtime: new Date(0),
    mtime: new Date(0),
    isDirectory: () => true
  } as any

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: DB_TOKEN_PROVIDER, useValue: {} },
        {
          provide: Cache,
          useValue: {}
        },
        {
          provide: NotificationsManager,
          useValue: {}
        },
        { provide: FilesQuotaManager, useValue: {} },
        SpacesManager,
        SpacesBrowser,
        SpacesQueries,
        SharesManager,
        SharesQueries,
        UsersQueries,
        FilesQueries,
        FilesLockManager,
        LinksQueries,
        FilesRecents
      ]
    }).compile()

    spacesBrowserService = module.get<SpacesBrowser>(SpacesBrowser)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should be defined', () => {
    expect(spacesBrowserService).toBeDefined()
  })

  it('should expose the space name while preserving its alias', async () => {
    const user = { id: 1, preferences: { showHiddenFiles: true } } as UserModel
    const space = {
      alias: 'communication',
      name: 'Communication',
      inSharesList: false,
      inTrashRepository: false,
      browsePermissions: vi.fn().mockReturnValue('a:m')
    } as unknown as SpaceEnv

    vi.spyOn(spacesBrowserService as any, 'parseFS').mockResolvedValue([])
    const parseDB = vi.spyOn(spacesBrowserService as any, 'parseDB').mockResolvedValue([])
    const parseRootFiles = vi.spyOn(spacesBrowserService as any, 'parseRootFiles').mockResolvedValue([])
    vi.spyOn((spacesBrowserService as any).filesRecents, 'updateRecents').mockResolvedValue(undefined)

    const result = await spacesBrowserService.browse(user, space)

    expect(result.space).toEqual({ alias: 'communication', name: 'Communication' })
    expect(parseDB).toHaveBeenCalledWith(user.id, space, null)
    expect(parseRootFiles).toHaveBeenCalledWith(user, space, null)
  })

  it.each([
    {
      name: 'regular user whose sync permissions were removed',
      isUser: true,
      isLink: false,
      syncs: true,
      favorites: true
    },
    { name: 'guest user', isUser: false, isLink: false, syncs: false, favorites: true },
    { name: 'link user', isUser: false, isLink: true, syncs: false, favorites: false }
  ])('resolves and propagates browse details for a $name', async ({ isUser, isLink, syncs, favorites }) => {
    const user = {
      id: 1,
      isUser,
      isLink,
      preferences: { showHiddenFiles: true }
    } as unknown as UserModel
    const space = {
      alias: 'communication',
      name: 'Communication',
      inSharesList: false,
      inTrashRepository: true,
      browsePermissions: vi.fn().mockReturnValue('a:m')
    } as unknown as SpaceEnv
    const parseDB = vi.spyOn(spacesBrowserService as any, 'parseDB').mockResolvedValue([])
    const parseRootFiles = vi.spyOn(spacesBrowserService as any, 'parseRootFiles').mockResolvedValue([])
    vi.spyOn(spacesBrowserService as any, 'parseFS').mockResolvedValue([])
    vi.spyOn((spacesBrowserService as any).filesRecents, 'updateRecents').mockResolvedValue(undefined)

    await spacesBrowserService.browse(user, space, true)

    const details = { syncs, favorites }
    expect(parseDB).toHaveBeenCalledWith(user.id, space, details)
    expect(parseRootFiles).toHaveBeenCalledWith(user, space, details)
    expect(parseDB.mock.calls[0][2]).toBe(parseRootFiles.mock.calls[0][2])
  })

  it('keeps an external root without a lock target enabled', async () => {
    vi.spyOn(fs, 'stat').mockResolvedValue(directoryStats)
    const getLocksByPath = vi.spyOn((spacesBrowserService as any).filesLockManager, 'getLocksByPath')

    const result = await (spacesBrowserService as any).updateRootFile(
      {
        file: {
          id: null,
          path: null,
          root: {
            id: 1,
            alias: 'downloads',
            name: 'Downloads',
            externalPath: '/storage/downloads',
            permissions: 'a:d:m',
            owner: { id: null, login: null, email: null, fullName: null }
          },
          shares: [],
          syncs: [],
          hasComments: false,
          isFavorite: false
        },
        dbFile: null
      },
      { syncs: false, favorites: false }
    )

    expect(getLocksByPath).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      name: 'Downloads',
      root: { id: 1, alias: 'downloads', enabled: true }
    })
  })

  it('does not use a share owner as its file lock namespace', async () => {
    vi.spyOn(fs, 'stat').mockResolvedValue(directoryStats)
    const getLocksByPath = vi.spyOn((spacesBrowserService as any).filesLockManager, 'getLocksByPath')

    await (spacesBrowserService as any).updateRootFile(
      {
        file: {
          path: '',
          origin: {
            ownerId: null,
            ownerLogin: null,
            spaceId: null,
            spaceAlias: null,
            spaceExternalRootId: null,
            spaceRootExternalPath: '/storage/downloads',
            shareExternalId: null
          },
          root: {
            id: 1,
            alias: 'downloads',
            name: 'Downloads',
            permissions: 'a:d:m',
            owner: { id: 42, login: 'share-owner', email: null, fullName: null }
          }
        },
        dbFile: null
      },
      { syncs: false, favorites: false }
    )

    expect(getLocksByPath).not.toHaveBeenCalled()
  })

  it('uses the query-provided external space root lock target', async () => {
    vi.spyOn(fs, 'stat').mockResolvedValue(directoryStats)
    const getLocksByPath = vi.spyOn((spacesBrowserService as any).filesLockManager, 'getLocksByPath').mockResolvedValue([])

    await (spacesBrowserService as any).updateRootFile(
      {
        file: {
          path: '',
          origin: {
            ownerId: null,
            ownerLogin: null,
            spaceId: null,
            spaceAlias: null,
            spaceExternalRootId: null,
            spaceRootExternalPath: '/storage/downloads',
            shareExternalId: null
          },
          root: {
            id: 1,
            alias: 'downloads',
            name: 'Downloads',
            permissions: 'a:d:m',
            owner: { id: 42, login: 'share-owner', email: null, fullName: null }
          }
        },
        dbFile: { spaceId: 7, spaceExternalRootId: 11, path: '.', inTrash: false }
      },
      { syncs: false, favorites: false }
    )

    expect(getLocksByPath).toHaveBeenCalledWith({ spaceId: 7, spaceExternalRootId: 11, path: '.', inTrash: false })
  })

  it('always hides internal temporary entries from filesystem browsing', async () => {
    vi.spyOn(fs, 'readdir').mockResolvedValue([
      { name: '.sync-in-tmp', isDirectory: () => true, isFile: () => false },
      { name: '.sync-in.uploading', isDirectory: () => false, isFile: () => true },
      { name: '.visible', isDirectory: () => false, isFile: () => true }
    ] as any)
    vi.spyOn(fs, 'stat').mockResolvedValue({
      ino: 1,
      size: 7,
      birthtime: new Date(0),
      mtime: new Date(0),
      isDirectory: () => false
    } as any)
    const names: string[] = []

    for await (const file of (spacesBrowserService as any).parsePath({ realPath: '/storage', relativeUrl: '/space' })) {
      names.push(file.name)
    }

    expect(names).toEqual(['.visible'])
  })

  it('reconciles hidden files before excluding them from the response', async () => {
    const user = { id: 1, isUser: true, isLink: false, preferences: { showHiddenFiles: false } } as UserModel
    const space = {
      alias: 'personal',
      name: 'Personal',
      inSharesList: false,
      inTrashRepository: false,
      browsePermissions: vi.fn().mockReturnValue('a:m')
    } as unknown as SpaceEnv
    const hiddenFSFile = { name: '.hidden', path: '', size: 1 }
    const hiddenDBFile = { id: 1, name: '.hidden', path: '', size: 1 }
    vi.spyOn(spacesBrowserService as any, 'parseFS').mockResolvedValue([hiddenFSFile])
    vi.spyOn(spacesBrowserService as any, 'parseDB').mockResolvedValue([hiddenDBFile])
    vi.spyOn(spacesBrowserService as any, 'parseRootFiles').mockResolvedValue([])
    const compareAndUpdate = vi.spyOn((spacesBrowserService as any).filesQueries, 'compareAndUpdateFileProps').mockResolvedValue(undefined)
    const deleteDBFile = vi.spyOn(spacesBrowserService as any, 'deleteDBFile').mockResolvedValue(undefined)
    vi.spyOn((spacesBrowserService as any).filesRecents, 'updateRecents').mockResolvedValue(undefined)

    const result = await spacesBrowserService.browse(user, space)

    expect(result.files).toEqual([])
    expect(compareAndUpdate).toHaveBeenCalledWith(hiddenDBFile, expect.objectContaining({ id: hiddenDBFile.id, name: '.hidden' }))
    expect(deleteDBFile).not.toHaveBeenCalled()
  })

  it('includes hidden files when explicitly requested', async () => {
    const user = { id: 1, isUser: true, isLink: false, preferences: { showHiddenFiles: false } } as UserModel
    const space = {
      alias: 'personal',
      name: 'Personal',
      inSharesList: false,
      inTrashRepository: false,
      browsePermissions: vi.fn().mockReturnValue('a:m')
    } as unknown as SpaceEnv
    const hiddenFSFile = { name: '.hidden', path: '', size: 1 }
    const hiddenDBFile = { id: 1, name: '.hidden', path: '', size: 1 }
    vi.spyOn(spacesBrowserService as any, 'parseFS').mockResolvedValue([hiddenFSFile])
    vi.spyOn(spacesBrowserService as any, 'parseDB').mockResolvedValue([hiddenDBFile])
    vi.spyOn(spacesBrowserService as any, 'parseRootFiles').mockResolvedValue([])
    vi.spyOn((spacesBrowserService as any).filesQueries, 'compareAndUpdateFileProps').mockResolvedValue(undefined)
    const updateRecents = vi.spyOn((spacesBrowserService as any).filesRecents, 'updateRecents').mockResolvedValue(undefined)

    const result = await spacesBrowserService.browse(user, space, false, true)

    expect(result.files).toEqual([expect.objectContaining({ name: '.hidden' })])
    expect(updateRecents).not.toHaveBeenCalled()
  })

  it('removes stale database metadata for a hidden file missing from the filesystem', async () => {
    const user = { id: 1, isUser: true, isLink: false, preferences: { showHiddenFiles: false } } as UserModel
    const space = {
      alias: 'personal',
      name: 'Personal',
      inSharesList: false,
      inTrashRepository: false,
      browsePermissions: vi.fn().mockReturnValue('a:m')
    } as unknown as SpaceEnv
    const hiddenDBFile = { id: 1, name: '.hidden', path: '', size: 1 }
    vi.spyOn(spacesBrowserService as any, 'parseFS').mockResolvedValue([])
    vi.spyOn(spacesBrowserService as any, 'parseDB').mockResolvedValue([hiddenDBFile])
    vi.spyOn(spacesBrowserService as any, 'parseRootFiles').mockResolvedValue([])
    const deleteDBFile = vi.spyOn(spacesBrowserService as any, 'deleteDBFile').mockResolvedValue(undefined)
    vi.spyOn((spacesBrowserService as any).filesRecents, 'updateRecents').mockResolvedValue(undefined)

    await spacesBrowserService.browse(user, space)

    expect(deleteDBFile).toHaveBeenCalledWith(user, space, hiddenDBFile)
  })
})
