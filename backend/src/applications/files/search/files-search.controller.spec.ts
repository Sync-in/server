import { Test, TestingModule } from '@nestjs/testing'
import { FilesSearchController } from './files-search.controller.js'
import { FilesContentIndexer } from './services/files-content-indexer.service.js'
import { FilesSearchManager } from './services/files-search-manager.service.js'

describe(FilesSearchController.name, () => {
  let filesSearchController: FilesSearchController

  const fakeUser: any = { id: 1, login: 'john', role: 1 }
  const filesSearchMock = { search: vi.fn() }

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FilesSearchController],
      providers: [
        { provide: FilesSearchManager, useValue: filesSearchMock },
        { provide: FilesContentIndexer, useValue: {} }
      ]
    }).compile()

    filesSearchController = module.get<FilesSearchController>(FilesSearchController)
  })

  it('should be defined', () => {
    expect(filesSearchController).toBeDefined()
  })

  it('search() should delegate to filesSearch.search(user, dto)', async () => {
    const dto = { query: 'test' } as any
    const items = [{ name: 'file' }] as any
    filesSearchMock.search.mockResolvedValue(items)

    const result = await filesSearchController.search(fakeUser, dto)

    expect(filesSearchMock.search).toHaveBeenCalledWith(fakeUser, dto)
    expect(result).toBe(items)
  })
})
