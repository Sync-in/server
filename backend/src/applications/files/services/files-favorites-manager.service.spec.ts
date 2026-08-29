import { HttpException, HttpStatus } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { SharesQueries } from '../../shares/services/shares-queries.service'
import { SPACE_ALIAS } from '../../spaces/constants/spaces'
import { SpacesQueries } from '../../spaces/services/spaces-queries.service'
import { USER_PERMISSION } from '../../users/constants/user'
import { FILE_REPOSITORY } from '../constants/operations'
import type { FileProps } from '../interfaces/file-props.interface'
import { getProps, isPathExists } from '../utils/files'
import { FilesFavoritesManager } from './files-favorites-manager.service'
import { FilesFavoritesQueries } from './files-favorites-queries.service'
import { FilesQueries } from './files-queries.service'
import type { Mock } from 'vitest'

vi.mock('../utils/files', () => ({
  getProps: vi.fn(),
  isPathExists: vi.fn()
}))

describe(FilesFavoritesManager.name, () => {
  let service: FilesFavoritesManager
  let filesQueries: {
    getOrCreateSpaceFile: Mock
  }
  let filesFavoritesQueries: {
    getFavoritesFromUser: Mock
    getFavoriteLocationsFromSpaces: Mock
    getFavoriteLocationsFromShares: Mock
    addFavorite: Mock
    removeFavorite: Mock
  }
  let spacesQueries: { spaceIdentities: Mock }
  let sharesQueries: { shareIdentities: Mock }

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.mocked(isPathExists).mockResolvedValue(true)
    vi.mocked(getProps).mockResolvedValue({ name: 'file.txt', path: 'docs' } as FileProps)
    filesQueries = {
      getOrCreateSpaceFile: vi.fn()
    }
    filesFavoritesQueries = {
      getFavoritesFromUser: vi.fn().mockResolvedValue([]),
      getFavoriteLocationsFromSpaces: vi.fn().mockResolvedValue([]),
      getFavoriteLocationsFromShares: vi.fn().mockResolvedValue([]),
      addFavorite: vi.fn().mockResolvedValue(undefined),
      removeFavorite: vi.fn().mockResolvedValue(undefined)
    }
    spacesQueries = { spaceIdentities: vi.fn().mockResolvedValue([]) }
    sharesQueries = { shareIdentities: vi.fn().mockResolvedValue([]) }
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesFavoritesManager,
        { provide: FilesQueries, useValue: filesQueries },
        { provide: FilesFavoritesQueries, useValue: filesFavoritesQueries },
        { provide: SpacesQueries, useValue: spacesQueries },
        { provide: SharesQueries, useValue: sharesQueries }
      ]
    }).compile()

    module.useLogger(['fatal'])
    service = module.get(FilesFavoritesManager)
  })

  const userWithPermissions = (applications: USER_PERMISSION[] = [], isAdmin = false, isUser = true) =>
    ({
      id: 7,
      isAdmin,
      isUser,
      havePermission: (permission: USER_PERMISSION) => isAdmin || applications.includes(permission)
    }) as any

  const makeSpace = (dbFile: Record<string, unknown> = {}) =>
    ({
      realPath: '/storage/docs/file.txt',
      dbFile: {
        path: 'docs',
        ownerId: 7,
        spaceExternalRootId: null,
        shareExternalId: null,
        ...dbFile
      }
    }) as any

  it('should resolve favorites from cached accessible locations by repository priority', async () => {
    filesFavoritesQueries.getFavoritesFromUser.mockResolvedValueOnce([
      {
        fileId: 1,
        id: 1,
        repository: SPACE_ALIAS.PERSONAL,
        name: 'personal.txt',
        path: 'files/personal/docs',
        isDisabled: false
      },
      { fileId: 2, id: 2, name: 'missing.txt', path: 'missing', isDisabled: true }
    ])
    spacesQueries.spaceIdentities.mockResolvedValueOnce([{ id: 10 }])
    sharesQueries.shareIdentities.mockResolvedValueOnce([{ id: 20 }])
    filesFavoritesQueries.getFavoriteLocationsFromSpaces.mockResolvedValueOnce([
      {
        fileId: 2,
        repository: FILE_REPOSITORY.SPACE,
        path: 'files/project/docs',
        name: 'space.txt',
        displayRootName: 'Project',
        contextId: 10,
        rootId: 0
      }
    ])
    filesFavoritesQueries.getFavoriteLocationsFromShares.mockResolvedValueOnce([
      {
        fileId: 2,
        repository: FILE_REPOSITORY.SHARE,
        path: 'shares/public/docs',
        name: 'share.txt',
        contextId: 20,
        rootId: 0
      }
    ])

    const result = await service.getFavorites(
      userWithPermissions([USER_PERMISSION.PERSONAL_SPACE, USER_PERMISSION.SPACES, USER_PERMISSION.SHARES], true)
    )

    expect(spacesQueries.spaceIdentities).toHaveBeenCalledWith(7)
    expect(sharesQueries.shareIdentities).toHaveBeenCalledWith(7, 1)
    expect(filesFavoritesQueries.getFavoritesFromUser).toHaveBeenCalledWith(7, true, true)
    expect(filesFavoritesQueries.getFavoriteLocationsFromSpaces).toHaveBeenCalledWith(7, [10])
    expect(filesFavoritesQueries.getFavoriteLocationsFromShares).toHaveBeenCalledWith(7, [20])
    expect(result[0]).toMatchObject({
      fileId: 1,
      repository: SPACE_ALIAS.PERSONAL,
      path: 'files/personal/docs',
      name: 'personal.txt',
      isDisabled: false
    })
    expect(result[0]).not.toHaveProperty('priority')
    expect(result[1]).toMatchObject({
      fileId: 2,
      repository: FILE_REPOSITORY.SPACE,
      path: 'files/project/docs',
      name: 'space.txt',
      displayRootName: 'Project',
      isDisabled: false
    })
    expect(result[1]).not.toHaveProperty('priority')
  })

  it('should skip inaccessible repositories', async () => {
    filesFavoritesQueries.getFavoritesFromUser.mockResolvedValueOnce([{ fileId: 1, id: 1, name: 'stored.txt', path: 'stored', isDisabled: true }])

    const result = await service.getFavorites(userWithPermissions())

    expect(spacesQueries.spaceIdentities).not.toHaveBeenCalled()
    expect(sharesQueries.shareIdentities).not.toHaveBeenCalled()
    expect(filesFavoritesQueries.getFavoritesFromUser).toHaveBeenCalledWith(7, false, true)
    expect(filesFavoritesQueries.getFavoriteLocationsFromSpaces).not.toHaveBeenCalled()
    expect(filesFavoritesQueries.getFavoriteLocationsFromShares).not.toHaveBeenCalled()
    expect(result).toEqual([{ fileId: 1, id: 1, name: 'stored.txt', path: 'stored', isDisabled: true }])
  })

  it('should skip sync details for guests', async () => {
    await service.getFavorites(userWithPermissions([], false, false))

    expect(filesFavoritesQueries.getFavoritesFromUser).toHaveBeenCalledWith(7, false, false)
  })

  it('should add an already indexed favorite', async () => {
    filesQueries.getOrCreateSpaceFile.mockResolvedValueOnce(42)
    const space = makeSpace()

    await expect(service.addFavorite(userWithPermissions(), space, 42)).resolves.toEqual({ fileId: 42 })

    const fileProps = { name: 'file.txt', path: 'docs', id: undefined }
    expect(filesQueries.getOrCreateSpaceFile).toHaveBeenCalledWith(42, fileProps, space.dbFile, { rejectIdMismatch: true })
    expect(filesFavoritesQueries.addFavorite).toHaveBeenCalledWith(7, 42)
  })

  it('should index an untracked file before adding it', async () => {
    filesQueries.getOrCreateSpaceFile.mockResolvedValueOnce(84)
    const space = makeSpace()

    await expect(service.addFavorite(userWithPermissions(), space, -1)).resolves.toEqual({ fileId: 84 })

    const fileProps = { name: 'file.txt', path: 'docs', id: undefined }
    expect(filesQueries.getOrCreateSpaceFile).toHaveBeenCalledWith(-1, fileProps, space.dbFile, { rejectIdMismatch: true })
    expect(filesFavoritesQueries.addFavorite).toHaveBeenCalledWith(7, 84)
  })

  it('should reject a favorite when the provided file id does not match the indexed file', async () => {
    filesQueries.getOrCreateSpaceFile.mockRejectedValueOnce(new HttpException('File id mismatch', HttpStatus.BAD_REQUEST))

    await expect(service.addFavorite(userWithPermissions(), makeSpace(), 42)).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST })

    expect(filesFavoritesQueries.addFavorite).not.toHaveBeenCalled()
  })

  it.each(['spaceExternalRootId', 'shareExternalId'])('should reject a virtual external root identified by %s', async (externalId) => {
    const space = makeSpace({ path: '.', [externalId]: 10 })

    await expect(service.addFavorite(userWithPermissions(), space, -1)).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST })

    expect(isPathExists).not.toHaveBeenCalled()
    expect(filesFavoritesQueries.addFavorite).not.toHaveBeenCalled()
  })

  it('should remove only the current user favorite', async () => {
    await service.removeFavorite(userWithPermissions(), 42)

    expect(filesFavoritesQueries.removeFavorite).toHaveBeenCalledWith(7, 42)
  })
})
