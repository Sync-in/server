import { Test, TestingModule } from '@nestjs/testing'
import { UserModel } from '../../users/models/user.model'
import { FilesQueries } from './files-queries.service'
import { FilesFavorites } from './files-favorites.service'

describe(FilesFavorites.name, () => {
  let service: FilesFavorites
  let filesQueries: {
    getFavorites: jest.Mock
    addFavorite: jest.Mock
    removeFavorite: jest.Mock
  }

  const user = { id: 1 } as UserModel

  beforeEach(async () => {
    filesQueries = {
      getFavorites: jest.fn().mockResolvedValue([]),
      addFavorite: jest.fn().mockResolvedValue(undefined),
      removeFavorite: jest.fn().mockResolvedValue(undefined)
    }
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesFavorites,
        { provide: FilesQueries, useValue: filesQueries },
      ],
    }).compile()
    module.useLogger(['fatal'])
    service = module.get<FilesFavorites>(FilesFavorites)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should be defined', () => expect(service).toBeDefined())

  it('getFavorites delegates to filesQueries with userId', async () => {
    const files = [{ id: 1, name: 'a.txt' }]
    filesQueries.getFavorites.mockResolvedValue(files)
    const result = await service.getFavorites(user)
    expect(result).toBe(files)
    expect(filesQueries.getFavorites).toHaveBeenCalledWith(user.id, undefined)
  })

  it('getFavorites passes limit when provided', async () => {
    await service.getFavorites(user, 5)
    expect(filesQueries.getFavorites).toHaveBeenCalledWith(user.id, 5)
  })

  it('addFavorite delegates to filesQueries with userId and fileId', async () => {
    await service.addFavorite(user, 42)
    expect(filesQueries.addFavorite).toHaveBeenCalledWith(user.id, 42)
  })

  it('removeFavorite delegates to filesQueries with userId and fileId', async () => {
    await service.removeFavorite(user, 42)
    expect(filesQueries.removeFavorite).toHaveBeenCalledWith(user.id, 42)
  })
})
