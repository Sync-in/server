/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Test, TestingModule } from '@nestjs/testing'
import { SpaceGuard } from '../spaces/guards/space.guard'
import { FILE_OPERATION } from './constants/operations'
import { FilesController } from './files.controller'
import { FilesMethods } from './services/files-methods.service'
import { FilesRecents } from './services/files-recents.service'
import { FilesSearchManager } from './services/files-search-manager.service'
import { FilesTasksManager } from './services/files-tasks-manager.service'

describe(FilesController.name, () => {
  let filesController: FilesController

  // Reusable fakes
  const fakeUser: any = { id: 1, login: 'john', role: 1 }
  const fakeSpace: any = { id: 42, key: 'space-key', url: '/space/a', realPath: '/data/space/a', realBasePath: '/data/space' }
  const fakeReq: any = { user: fakeUser, space: fakeSpace, headers: {}, method: 'GET', ip: '127.0.0.1' }
  const fakeRes: any = { header: jest.fn().mockReturnThis(), status: jest.fn().mockReturnThis(), type: jest.fn().mockReturnThis(), send: jest.fn() }

  // Mocks
  const filesMethodsMock = {
    headOrGet: jest.fn(),
    make: jest.fn(),
    upload: jest.fn(),
    copy: jest.fn(),
    move: jest.fn(),
    delete: jest.fn(),
    genThumbnail: jest.fn(),
    downloadFromUrl: jest.fn(),
    compress: jest.fn(),
    decompress: jest.fn()
  }

  const filesTasksManagerMock = {
    createTask: jest.fn()
  }

  const filesRecentsMock = {
    getRecents: jest.fn()
  }

  const filesSearchMock = {
    search: jest.fn()
  }

  beforeAll(async () => {
    const testingModuleBuilder = Test.createTestingModule({
      controllers: [FilesController],
      providers: [
        { provide: FilesMethods, useValue: filesMethodsMock },
        { provide: FilesTasksManager, useValue: filesTasksManagerMock },
        { provide: FilesRecents, useValue: filesRecentsMock },
        { provide: FilesSearchManager, useValue: filesSearchMock }
      ]
    })
    // IMPORTANT: override the guard referenced by @UseGuards to avoid resolving its dependencies
    testingModuleBuilder.overrideGuard(SpaceGuard).useValue({ canActivate: jest.fn().mockReturnValue(true) })

    const module: TestingModule = await testingModuleBuilder.compile()

    filesController = module.get<FilesController>(FilesController)
  })

  it('should be defined', () => {
    expect(filesController).toBeDefined()
  })

  describe('Operations', () => {
    beforeEach(() => {
      jest.clearAllMocks()
    })

    it('head() should delegate to filesMethods.headOrGet(req, res) and return its result', async () => {
      const stream = {} as any
      filesMethodsMock.headOrGet.mockResolvedValue(stream)

      const result = await filesController.head(fakeReq, fakeRes)

      expect(filesMethodsMock.headOrGet).toHaveBeenCalledWith(fakeReq, fakeRes)
      expect(result).toBe(stream)
    })

    it('download() should delegate to filesMethods.headOrGet(req, res) and return its result', async () => {
      const stream = {} as any
      filesMethodsMock.headOrGet.mockResolvedValue(stream)

      const result = await filesController.download(fakeReq, fakeRes)

      expect(filesMethodsMock.headOrGet).toHaveBeenCalledWith(fakeReq, fakeRes)
      expect(result).toBe(stream)
    })

    it('make() should call filesMethods.make(user, space, dto)', async () => {
      const dto = { path: '/a', name: 'b', type: 'directory' } as any

      await filesController.make(fakeUser, fakeSpace, dto)

      expect(filesMethodsMock.make).toHaveBeenCalledWith(fakeUser, fakeSpace, dto)
    })

    it('upload() should call filesMethods.upload(req)', async () => {
      await filesController.uploadCreate(fakeReq)

      expect(filesMethodsMock.upload).toHaveBeenCalledWith(fakeReq)
    })

    it('copy() should call filesMethods.copy(user, space, dto) and return its result', async () => {
      const dto = { dstDirectory: '/dst', dstName: 'b' } as any
      const expected = { path: '/dst', name: 'b' }
      filesMethodsMock.copy.mockResolvedValue(expected)

      const result = await filesController.copy(fakeUser, fakeSpace, dto)

      expect(filesMethodsMock.copy).toHaveBeenCalledWith(fakeUser, fakeSpace, dto)
      expect(result).toEqual(expected)
    })

    it('move() should call filesMethods.move(user, space, dto) and return its result', async () => {
      const dto = { dstDirectory: '/dst', dstName: 'c' } as any
      const expected = { path: '/dst', name: 'c' }
      filesMethodsMock.move.mockResolvedValue(expected)

      const result = await filesController.move(fakeUser, fakeSpace, dto)

      expect(filesMethodsMock.move).toHaveBeenCalledWith(fakeUser, fakeSpace, dto)
      expect(result).toEqual(expected)
    })

    it('delete() should call filesMethods.delete(user, space)', async () => {
      await filesController.delete(fakeUser, fakeSpace)

      expect(filesMethodsMock.delete).toHaveBeenCalledWith(fakeUser, fakeSpace)
    })

    it('genThumbnail() should default size to 256 when not provided', async () => {
      const stream = {} as any
      filesMethodsMock.genThumbnail.mockResolvedValue(stream)

      // pass undefined to exercise controller default parameter
      const result = await filesController.genThumbnail(fakeSpace, undefined as unknown as number, fakeRes)

      expect(filesMethodsMock.genThumbnail).toHaveBeenCalledWith(fakeSpace, 256)
      expect(fakeRes.type).toHaveBeenCalled()
      expect(fakeRes.send).toHaveBeenCalledWith(stream)
      expect(result).toBeUndefined()
    })

    it('genThumbnail() should pass provided size', async () => {
      const stream = {} as any
      filesMethodsMock.genThumbnail.mockResolvedValue(stream)

      const result = await filesController.genThumbnail(fakeSpace, 512, fakeRes)

      expect(filesMethodsMock.genThumbnail).toHaveBeenCalledWith(fakeSpace, 512)
      expect(fakeRes.type).toHaveBeenCalled()
      expect(fakeRes.send).toHaveBeenCalledWith(stream)
      expect(result).toBeUndefined()
    })

    it('genThumbnail() should reduce size larger than 1024', async () => {
      const stream = {} as any
      filesMethodsMock.genThumbnail.mockResolvedValue(stream)

      const result = await filesController.genThumbnail(fakeSpace, 2048, fakeRes)

      expect(filesMethodsMock.genThumbnail).toHaveBeenCalledWith(fakeSpace, 1024)
      expect(fakeRes.type).toHaveBeenCalled()
      expect(fakeRes.send).toHaveBeenCalledWith(stream)
      expect(result).toBeUndefined()
    })
  })

  describe('Tasks operations', () => {
    beforeEach(() => {
      jest.clearAllMocks()
    })

    it('downloadFromUrlAsTask() should create DOWNLOAD task using method name "downloadFromUrl"', async () => {
      const dto = { url: 'http://x', to: '/a' } as any
      const task = { id: 1 } as any
      filesTasksManagerMock.createTask.mockResolvedValue(task)

      const result = await filesController.downloadFromUrlAsTask(fakeUser, fakeSpace, dto)

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
      const spy = jest.spyOn(SpaceGuard as any, 'checkPermissions').mockImplementation(() => undefined)

      filesTasksManagerMock.createTask.mockResolvedValue({} as any)
      await filesController.compressAsTask(fakeReq, dto)

      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
    })

    it('compressAsTask() should create COMPRESS task with req.user and req.space and method name "compress"', async () => {
      const dto = { compressInDirectory: false } as any
      const task = { id: 2 } as any
      filesTasksManagerMock.createTask.mockResolvedValue(task)

      const result = await filesController.compressAsTask(fakeReq, dto)

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

      const result = await filesController.decompressAsTask(fakeUser, fakeSpace)

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

      const result = await filesController.copyAsTask(fakeUser, fakeSpace, dto)

      expect(filesTasksManagerMock.createTask).toHaveBeenCalledWith(FILE_OPERATION.COPY, fakeUser, fakeSpace, dto, filesMethodsMock.copy.name)
      expect(result).toBe(task)
    })

    it('moveAsTask() should create MOVE task with method name "move"', async () => {
      const dto = { from: '/a', to: '/c' } as any
      const task = { id: 5 } as any
      filesTasksManagerMock.createTask.mockResolvedValue(task)

      const result = await filesController.moveAsTask(fakeUser, fakeSpace, dto)

      expect(filesTasksManagerMock.createTask).toHaveBeenCalledWith(FILE_OPERATION.MOVE, fakeUser, fakeSpace, dto, filesMethodsMock.move.name)
      expect(result).toBe(task)
    })

    it('deleteAsTask() should create DELETE task with null dto and method name "delete"', async () => {
      const task = { id: 6 } as any
      filesTasksManagerMock.createTask.mockResolvedValue(task)

      const result = await filesController.deleteAsTask(fakeUser, fakeSpace)

      expect(filesTasksManagerMock.createTask).toHaveBeenCalledWith(FILE_OPERATION.DELETE, fakeUser, fakeSpace, null, filesMethodsMock.delete.name)
      expect(result).toBe(task)
    })
  })

  describe('Recents & Search', () => {
    beforeEach(() => {
      jest.clearAllMocks()
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
