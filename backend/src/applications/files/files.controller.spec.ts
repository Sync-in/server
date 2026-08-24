import { Test, TestingModule } from '@nestjs/testing'
import { SpaceGuard } from '../spaces/guards/space.guard'
import { FilesController } from './files.controller'
import { FilesContentIndexer } from './services/files-content-indexer.service'
import { FilesFavoritesManager } from './services/files-favorites-manager.service'
import { FilesRecents } from './services/files-recents.service'
import { FilesSearchManager } from './services/files-search-manager.service'

describe(FilesController.name, () => {
  let filesController: FilesController

  const fakeUser: any = { id: 1, login: 'john', role: 1 }

  const filesRecentsMock = {
    getRecents: vi.fn()
  }

  const filesSearchMock = {
    search: vi.fn()
  }

  beforeAll(async () => {
    const testingModuleBuilder = Test.createTestingModule({
      controllers: [FilesController],
      providers: [
        { provide: FilesRecents, useValue: filesRecentsMock },
        { provide: FilesSearchManager, useValue: filesSearchMock },
        { provide: FilesContentIndexer, useValue: {} },
        { provide: FilesFavoritesManager, useValue: {} }
      ]
    })
    testingModuleBuilder.overrideGuard(SpaceGuard).useValue({ canActivate: vi.fn().mockReturnValue(true) })

    const module: TestingModule = await testingModuleBuilder.compile()

    filesController = module.get<FilesController>(FilesController)
  })

  it('should be defined', () => {
    expect(filesController).toBeDefined()
  })

  describe('Recents & Search', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('getRecents() should use limit=10 by default', async () => {
      const recents = [{ path: '/a' }] as any
      filesRecentsMock.getRecents.mockResolvedValue(recents)

      const result = await filesController.getRecents(fakeUser, undefined as unknown as number)

      expect(filesRecentsMock.getRecents).toHaveBeenCalledWith(fakeUser, 10)
      expect(result).toBe(recents)
    })

    it('getRecents() should forward provided limit', async () => {
      const recents = [{ path: '/b' }] as any
      filesRecentsMock.getRecents.mockResolvedValue(recents)

      const result = await filesController.getRecents(fakeUser, 5)

      expect(filesRecentsMock.getRecents).toHaveBeenCalledWith(fakeUser, 5)
      expect(result).toBe(recents)
    })

    it('search() should delegate to filesSearch.search(user, dto)', async () => {
      const dto = { query: 'test' } as any
      const items = [{ name: 'file' }] as any
      filesSearchMock.search.mockResolvedValue(items)

      const result = await filesController.search(fakeUser, dto)

      expect(filesSearchMock.search).toHaveBeenCalledWith(fakeUser, dto)
      expect(result).toBe(items)
    })
  })
})
