/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Test, TestingModule } from '@nestjs/testing'
import { ContextInterceptor } from '../../infrastructure/context/interceptors/context.interceptor'
import { ContextManager } from '../../infrastructure/context/services/context-manager.service'
import { SpacesManager } from '../spaces/services/spaces-manager.service'
import { FilesOnlyOfficeController } from './files-only-office.controller'
import { FilesMethods } from './services/files-methods.service'
import { FilesOnlyOfficeManager } from './services/files-only-office-manager.service'

describe(FilesOnlyOfficeController.name, () => {
  let controller: FilesOnlyOfficeController

  const filesOnlyOfficeManagerMock = {
    getSettings: jest.fn(),
    callBack: jest.fn()
  }

  const filesMethodsMock = {
    headOrGet: jest.fn()
  }

  beforeEach(async () => {
    jest.clearAllMocks()
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FilesOnlyOfficeController],
      providers: [
        { provide: FilesOnlyOfficeManager, useValue: filesOnlyOfficeManagerMock },
        { provide: FilesMethods, useValue: filesMethodsMock },
        { provide: SpacesManager, useValue: {} },
        ContextManager,
        ContextInterceptor
      ]
    }).compile()

    controller = module.get<FilesOnlyOfficeController>(FilesOnlyOfficeController)
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })

  describe('onlyOfficeSettings', () => {
    it('should call manager with default mode "view" when mode is undefined', async () => {
      const user: any = { id: 1 }
      const space: any = { id: 'space-1' }
      const req: any = { headers: {}, params: {}, query: {} }
      const expected = { config: 'ok', mode: 'view' }
      filesOnlyOfficeManagerMock.getSettings.mockResolvedValue(expected)

      const result = await controller.onlyOfficeSettings(user, space, undefined as any, req)

      expect(filesOnlyOfficeManagerMock.getSettings).toHaveBeenCalledTimes(1)
      expect(filesOnlyOfficeManagerMock.getSettings).toHaveBeenCalledWith(user, space, 'view', req)
      expect(result).toBe(expected)
    })

    it('should pass provided mode to manager', async () => {
      const user: any = { id: 2 }
      const space: any = { id: 'space-2' }
      const req: any = { headers: { 'x-test': '1' } }
      const expected = { config: 'ok', mode: 'edit' }
      filesOnlyOfficeManagerMock.getSettings.mockResolvedValue(expected)

      const result = await controller.onlyOfficeSettings(user, space, 'edit', req)

      expect(filesOnlyOfficeManagerMock.getSettings).toHaveBeenCalledWith(user, space, 'edit', req)
      expect(result).toBe(expected)
    })
  })

  describe('onlyOfficeDocument', () => {
    it('should delegate to filesMethods.headOrGet with req and res', async () => {
      const req: any = { params: { '*': 'path/to/file' } }
      const res: any = { header: jest.fn(), status: jest.fn().mockReturnThis() }
      const stream: any = { readable: true }
      filesMethodsMock.headOrGet.mockResolvedValue(stream)

      const result = await controller.onlyOfficeDocument(req, res)

      expect(filesMethodsMock.headOrGet).toHaveBeenCalledTimes(1)
      expect(filesMethodsMock.headOrGet).toHaveBeenCalledWith(req, res)
      expect(result).toBe(stream)
    })
  })

  describe('onlyOfficeCallBack', () => {
    it('should call manager.callBack with user, space, token and fileId (fid)', async () => {
      const user: any = { id: 3 }
      const space: any = { id: 'space-3' }
      const token = 'jwt-token'
      const fileId = 'file-123'
      const expected = { ok: true }
      filesOnlyOfficeManagerMock.callBack.mockResolvedValue(expected)

      const result = await controller.onlyOfficeCallBack(user, space, token, fileId)

      expect(filesOnlyOfficeManagerMock.callBack).toHaveBeenCalledTimes(1)
      expect(filesOnlyOfficeManagerMock.callBack).toHaveBeenCalledWith(user, space, token, fileId)
      expect(result).toBe(expected)
    })
  })
})
