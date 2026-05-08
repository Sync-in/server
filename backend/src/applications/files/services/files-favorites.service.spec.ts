import { Test, TestingModule } from '@nestjs/testing'
import { SharesQueries } from '../../shares/services/shares-queries.service'
import { SpacesQueries } from '../../spaces/services/spaces-queries.service'
import { UserModel } from '../../users/models/user.model'
import { FavoriteFileDto } from '../dto/favorite-file.dto'
import { FilesQueries } from './files-queries.service'
import { FilesFavorites } from './files-favorites.service'

describe(FilesFavorites.name, () => {
  let service: FilesFavorites
  let filesQueries: {
    getFavorites: jest.Mock
    getOrCreateFileForFavorite: jest.Mock
    addFavorite: jest.Mock
    getFavoriteForFile: jest.Mock
    removeFavorite: jest.Mock
  }
  let spacesQueries: { spaceIds: jest.Mock }
  let sharesQueries: { shareIds: jest.Mock }

  const user = { id: 1, isAdmin: 0 } as unknown as UserModel

  beforeEach(async () => {
    filesQueries = {
      getFavorites: jest.fn().mockResolvedValue([]),
      getOrCreateFileForFavorite: jest.fn().mockResolvedValue(99),
      addFavorite: jest.fn().mockResolvedValue(undefined),
      getFavoriteForFile: jest.fn().mockResolvedValue({ id: 99, name: 'test.txt', navPath: 'files/personal' }),
      removeFavorite: jest.fn().mockResolvedValue(undefined)
    }
    spacesQueries = { spaceIds: jest.fn().mockResolvedValue([]) }
    sharesQueries = { shareIds: jest.fn().mockResolvedValue([]) }
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesFavorites,
        { provide: FilesQueries, useValue: filesQueries },
        { provide: SpacesQueries, useValue: spacesQueries },
        { provide: SharesQueries, useValue: sharesQueries }
      ]
    }).compile()
    module.useLogger(['fatal'])
    service = module.get<FilesFavorites>(FilesFavorites)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  it('getFavorites delegates to filesQueries with userId, spaceIds, shareIds and default limit', async () => {
    const files = [{ id: 1, name: 'a.txt' }]
    filesQueries.getFavorites.mockResolvedValue(files)
    const result = await service.getFavorites(user)
    expect(result).toBe(files)
    expect(filesQueries.getFavorites).toHaveBeenCalledWith(user.id, [], [], 100)
  })

  it('getFavorites passes limit when provided', async () => {
    await service.getFavorites(user, 5)
    expect(filesQueries.getFavorites).toHaveBeenCalledWith(user.id, [], [], 5)
  })

  it('getFavorites caps limit at 1000', async () => {
    await service.getFavorites(user, 9999)
    expect(filesQueries.getFavorites).toHaveBeenCalledWith(user.id, [], [], 1000)
  })

  it('addFavorite calls getOrCreateFileForFavorite, addFavorite, getFavoriteForFile and returns FileFavorite', async () => {
    const dto: FavoriteFileDto = { path: '.', name: 'test.txt', isDir: false }
    const favorite = { id: 99, name: 'test.txt', navPath: 'files/personal' }
    filesQueries.getOrCreateFileForFavorite.mockResolvedValue(99)
    filesQueries.getFavoriteForFile.mockResolvedValue(favorite)
    const result = await service.addFavorite(user, dto)
    expect(filesQueries.getOrCreateFileForFavorite).toHaveBeenCalledWith(dto)
    expect(filesQueries.addFavorite).toHaveBeenCalledWith(user.id, 99)
    expect(filesQueries.getFavoriteForFile).toHaveBeenCalledWith(user.id, 99)
    expect(result).toBe(favorite)
  })

  it('removeFavorite delegates to filesQueries with userId and fileId', async () => {
    await service.removeFavorite(user, 42)
    expect(filesQueries.removeFavorite).toHaveBeenCalledWith(user.id, 42)
  })
})
