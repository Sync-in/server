import { Test, TestingModule } from '@nestjs/testing'
import { FilesRecentsController } from './files-recents.controller.js'
import { FilesRecents } from './services/files-recents.service.js'

describe(FilesRecentsController.name, () => {
  let filesRecentsController: FilesRecentsController

  const fakeUser: any = { id: 1, login: 'john', role: 1 }
  const filesRecentsMock = { getRecents: vi.fn() }

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FilesRecentsController],
      providers: [{ provide: FilesRecents, useValue: filesRecentsMock }]
    }).compile()

    filesRecentsController = module.get<FilesRecentsController>(FilesRecentsController)
  })

  it('should be defined', () => {
    expect(filesRecentsController).toBeDefined()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getRecents() should use limit=25 by default', async () => {
    const recents = [{ path: '/a' }] as any
    filesRecentsMock.getRecents.mockResolvedValue(recents)

    const result = await filesRecentsController.getRecents(fakeUser, undefined as unknown as number)

    expect(filesRecentsMock.getRecents).toHaveBeenCalledWith(fakeUser, 25)
    expect(result).toBe(recents)
  })

  it('getRecents() should forward provided limit', async () => {
    const recents = [{ path: '/b' }] as any
    filesRecentsMock.getRecents.mockResolvedValue(recents)

    const result = await filesRecentsController.getRecents(fakeUser, 5)

    expect(filesRecentsMock.getRecents).toHaveBeenCalledWith(fakeUser, 5)
    expect(result).toBe(recents)
  })
})
