import { Test, TestingModule } from '@nestjs/testing'
import { ContextInterceptor } from '../../infrastructure/context/interceptors/context.interceptor'
import { ContextManager } from '../../infrastructure/context/services/context-manager.service'
import { SpaceGuard } from '../spaces/guards/space.guard'
import { FILE_OPERATION } from './constants/operations'
import { FilesOperationsController } from './files-operations.controller'
import { FilesMethods } from './services/files-methods.service'
import { FilesTasksManager } from './services/tasks/files-tasks-manager.service'

describe(FilesOperationsController.name, () => {
  let filesOperationsController: FilesOperationsController

  // Reusable fakes
  const fakeUser: any = { id: 1, login: 'john', role: 1 }
  const fakeSpace: any = { id: 42, key: 'space-key', url: '/space/a', realPath: '/data/space/a', realBasePath: '/data/space' }
  const fakeReq: any = { user: fakeUser, space: fakeSpace, headers: {}, method: 'GET', ip: '127.0.0.1' }
  const fakeRes: any = { header: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis(), type: vi.fn().mockReturnThis(), send: vi.fn() }

  // Mocks
  const filesMethodsMock = {
    headOrGet: vi.fn(),
    make: vi.fn(),
    upload: vi.fn(),
    copy: vi.fn(),
    move: vi.fn(),
    delete: vi.fn(),
    genThumbnail: vi.fn(),
    downloadFromUrl: vi.fn(),
    compress: vi.fn(),
    decompress: vi.fn()
  }

  const filesTasksManagerMock = {
    createTask: vi.fn()
  }

  beforeAll(async () => {
    const testingModuleBuilder = Test.createTestingModule({
      controllers: [FilesOperationsController],
      providers: [
        { provide: FilesMethods, useValue: filesMethodsMock },
        { provide: FilesTasksManager, useValue: filesTasksManagerMock },
        { provide: ContextManager, useValue: {} },
        ContextInterceptor
      ]
    })
    // IMPORTANT: override the guard referenced by @UseGuards to avoid resolving its dependencies
    testingModuleBuilder.overrideGuard(SpaceGuard).useValue({ canActivate: vi.fn().mockReturnValue(true) })

    const module: TestingModule = await testingModuleBuilder.compile()

    filesOperationsController = module.get<FilesOperationsController>(FilesOperationsController)
  })

  it('should be defined', () => {
    expect(filesOperationsController).toBeDefined()
  })

  describe('Operations', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('head() should delegate to filesMethods.headOrGet(req, res) and return its result', async () => {
      const stream = {} as any
      filesMethodsMock.headOrGet.mockResolvedValue(stream)

      const result = await filesOperationsController.head(fakeReq, fakeRes)

      expect(filesMethodsMock.headOrGet).toHaveBeenCalledWith(fakeReq, fakeRes)
      expect(result).toBe(stream)
    })

    it('download() should delegate to filesMethods.headOrGet(req, res) and return its result', async () => {
      const stream = {} as any
      filesMethodsMock.headOrGet.mockResolvedValue(stream)

      const result = await filesOperationsController.download(fakeReq, fakeRes)

      expect(filesMethodsMock.headOrGet).toHaveBeenCalledWith(fakeReq, fakeRes)
      expect(result).toBe(stream)
    })

    it('make() should call filesMethods.make(user, space, dto)', async () => {
      const dto = { path: '/a', name: 'b', type: 'directory' } as any

      await filesOperationsController.make(fakeUser, fakeSpace, dto)

      expect(filesMethodsMock.make).toHaveBeenCalledWith(fakeUser, fakeSpace, dto)
    })

    it('upload() should call filesMethods.upload(req, res)', async () => {
      await filesOperationsController.uploadCreate(fakeReq, fakeRes)

      expect(filesMethodsMock.upload).toHaveBeenCalledWith(fakeReq, fakeRes)
    })

    it('copy() should call filesMethods.copy(user, space, dto) and return its result', async () => {
      const dto = { dstDirectory: '/dst', dstName: 'b' } as any
      const expected = { path: '/dst', name: 'b' }
      filesMethodsMock.copy.mockResolvedValue(expected)

      const result = await filesOperationsController.copy(fakeUser, fakeSpace, dto)

      expect(filesMethodsMock.copy).toHaveBeenCalledWith(fakeUser, fakeSpace, dto)
      expect(result).toEqual(expected)
    })

    it('move() should call filesMethods.move(user, space, dto) and return its result', async () => {
      const dto = { dstDirectory: '/dst', dstName: 'c' } as any
      const expected = { path: '/dst', name: 'c' }
      filesMethodsMock.move.mockResolvedValue(expected)

      const result = await filesOperationsController.move(fakeUser, fakeSpace, dto)

      expect(filesMethodsMock.move).toHaveBeenCalledWith(fakeUser, fakeSpace, dto)
      expect(result).toEqual(expected)
    })

    it('delete() should call filesMethods.delete(user, space)', async () => {
      await filesOperationsController.delete(fakeUser, fakeSpace)

      expect(filesMethodsMock.delete).toHaveBeenCalledWith(fakeUser, fakeSpace)
    })

    it('genThumbnail() should default size to 256 when not provided', async () => {
      const stream = {} as any
      filesMethodsMock.genThumbnail.mockResolvedValue(stream)

      // pass undefined to exercise controller default parameter
      const result = await filesOperationsController.genThumbnail(fakeSpace, undefined as unknown as number, fakeRes)

      expect(filesMethodsMock.genThumbnail).toHaveBeenCalledWith(fakeSpace, 256)
      expect(fakeRes.type).toHaveBeenCalled()
      expect(fakeRes.send).toHaveBeenCalledWith(stream)
      expect(result).toBeUndefined()
    })

    it('genThumbnail() should pass provided size', async () => {
      const stream = {} as any
      filesMethodsMock.genThumbnail.mockResolvedValue(stream)

      const result = await filesOperationsController.genThumbnail(fakeSpace, 512, fakeRes)

      expect(filesMethodsMock.genThumbnail).toHaveBeenCalledWith(fakeSpace, 512)
      expect(fakeRes.type).toHaveBeenCalled()
      expect(fakeRes.send).toHaveBeenCalledWith(stream)
      expect(result).toBeUndefined()
    })

    it('genThumbnail() should reduce size larger than 1024', async () => {
      const stream = {} as any
      filesMethodsMock.genThumbnail.mockResolvedValue(stream)

      const result = await filesOperationsController.genThumbnail(fakeSpace, 2048, fakeRes)

      expect(filesMethodsMock.genThumbnail).toHaveBeenCalledWith(fakeSpace, 1024)
      expect(fakeRes.type).toHaveBeenCalled()
      expect(fakeRes.send).toHaveBeenCalledWith(stream)
      expect(result).toBeUndefined()
    })
  })

  describe('Tasks operations', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('downloadFromUrlAsTask() should create DOWNLOAD task using method name "downloadFromUrl"', async () => {
      const dto = { url: 'http://x', to: '/a' } as any
      const task = { id: 1 } as any
      filesTasksManagerMock.createTask.mockResolvedValue(task)

      const result = await filesOperationsController.downloadFromUrlAsTask(fakeUser, fakeSpace, dto)

      expect(filesTasksManagerMock.createTask).toHaveBeenCalledWith(
        FILE_OPERATION.DOWNLOAD,
        fakeUser,
        fakeSpace,
        dto,
        filesMethodsMock.downloadFromUrl.name
      )
      expect(result).toBe(task)
    })

    it('compressAsTask() should call SpaceGuard.checkPermissions when compressInDirectory is true', async () => {
      const dto = { compressInDirectory: true } as any
      const spy = vi.spyOn(SpaceGuard as any, 'checkPermissions').mockImplementation(() => undefined)

      filesTasksManagerMock.createTask.mockResolvedValue({} as any)
      await filesOperationsController.compressAsTask(fakeReq, dto)

      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
    })

    it('compressAsTask() should create COMPRESS task with req.user and req.space and method name "compress"', async () => {
      const dto = { compressInDirectory: false } as any
      const task = { id: 2 } as any
      filesTasksManagerMock.createTask.mockResolvedValue(task)

      const result = await filesOperationsController.compressAsTask(fakeReq, dto)

      expect(filesTasksManagerMock.createTask).toHaveBeenCalledWith(
        FILE_OPERATION.COMPRESS,
        fakeReq.user,
        fakeReq.space,
        dto,
        filesMethodsMock.compress.name
      )
      expect(result).toBe(task)
    })

    it('decompressAsTask() should create DECOMPRESS task with null dto and method name "decompress"', async () => {
      const task = { id: 3 } as any
      filesTasksManagerMock.createTask.mockResolvedValue(task)

      const result = await filesOperationsController.decompressAsTask(fakeUser, fakeSpace)

      expect(filesTasksManagerMock.createTask).toHaveBeenCalledWith(
        FILE_OPERATION.DECOMPRESS,
        fakeUser,
        fakeSpace,
        null,
        filesMethodsMock.decompress.name
      )
      expect(result).toBe(task)
    })

    it('copyAsTask() should create COPY task with method name "copy"', async () => {
      const dto = { from: '/a', to: '/b' } as any
      const task = { id: 4 } as any
      filesTasksManagerMock.createTask.mockResolvedValue(task)

      const result = await filesOperationsController.copyAsTask(fakeUser, fakeSpace, dto)

      expect(filesTasksManagerMock.createTask).toHaveBeenCalledWith(FILE_OPERATION.COPY, fakeUser, fakeSpace, dto, filesMethodsMock.copy.name)
      expect(result).toBe(task)
    })

    it('moveAsTask() should create MOVE task with method name "move"', async () => {
      const dto = { from: '/a', to: '/c' } as any
      const task = { id: 5 } as any
      filesTasksManagerMock.createTask.mockResolvedValue(task)

      const result = await filesOperationsController.moveAsTask(fakeUser, fakeSpace, dto)

      expect(filesTasksManagerMock.createTask).toHaveBeenCalledWith(FILE_OPERATION.MOVE, fakeUser, fakeSpace, dto, filesMethodsMock.move.name)
      expect(result).toBe(task)
    })

    it('deleteAsTask() should create DELETE task with null dto and method name "delete"', async () => {
      const task = { id: 6 } as any
      filesTasksManagerMock.createTask.mockResolvedValue(task)

      const result = await filesOperationsController.deleteAsTask(fakeUser, fakeSpace)

      expect(filesTasksManagerMock.createTask).toHaveBeenCalledWith(FILE_OPERATION.DELETE, fakeUser, fakeSpace, null, filesMethodsMock.delete.name)
      expect(result).toBe(task)
    })
  })
})
