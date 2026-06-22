import { Test, TestingModule } from '@nestjs/testing'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { ContextInterceptor } from '../../../../infrastructure/context/interceptors/context.interceptor'
import { ContextManager } from '../../../../infrastructure/context/services/context-manager.service'
import { SpaceGuard } from '../../../spaces/guards/space.guard'
import { SpacesManager } from '../../../spaces/services/spaces-manager.service'
import { FILE_MODE } from '../../constants/operations'
import { FilesMethods } from '../../services/files-methods.service'
import { ONLY_OFFICE_CONTEXT } from './only-office.constants'
import { OnlyOfficeManager } from './only-office-manager.service'
import { OnlyOfficeController } from './only-office.controller'
import { OnlyOfficeGuard } from './only-office.guard'

describe(OnlyOfficeController.name, () => {
  let controller: OnlyOfficeController

  const filesOnlyOfficeManagerMock = {
    getSettings: vi.fn(),
    callBack: vi.fn()
  }

  const filesMethodsMock = {
    headOrGet: vi.fn()
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OnlyOfficeController],
      providers: [
        { provide: OnlyOfficeManager, useValue: filesOnlyOfficeManagerMock },
        { provide: FilesMethods, useValue: filesMethodsMock },
        { provide: SpacesManager, useValue: {} },
        ContextManager,
        ContextInterceptor
      ]
    }).compile()

    controller = module.get<OnlyOfficeController>(OnlyOfficeController)
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })

  it('should use access authentication for settings and editor authentication for document routes', () => {
    expect(Reflect.getMetadata(ONLY_OFFICE_CONTEXT, controller.onlyOfficeSettings)).toBeUndefined()
    expect(Reflect.getMetadata(GUARDS_METADATA, controller.onlyOfficeSettings)).toEqual([SpaceGuard])

    for (const handler of [controller.onlyOfficeDocument, controller.onlyOfficeCallBack]) {
      expect(Reflect.getMetadata(ONLY_OFFICE_CONTEXT, handler)).toBe(true)
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([OnlyOfficeGuard, SpaceGuard])
    }
  })

  describe('onlyOfficeSettings', () => {
    it('should call manager with default mode "view" when mode is undefined', async () => {
      const user: any = { id: 1 }
      const space: any = { id: 'space-1' }
      const req: any = { headers: {}, params: {}, query: {}, user, space }
      const expected = { config: 'ok', mode: FILE_MODE.VIEW }
      filesOnlyOfficeManagerMock.getSettings.mockResolvedValue(expected)

      const result = await controller.onlyOfficeSettings(req)

      expect(filesOnlyOfficeManagerMock.getSettings).toHaveBeenCalledTimes(1)
      expect(filesOnlyOfficeManagerMock.getSettings).toHaveBeenCalledWith(user, space, req)
      expect(result).toBe(expected)
    })

    it('should pass provided mode to manager', async () => {
      const user: any = { id: 2 }
      const space: any = { id: 'space-2' }
      const req: any = { headers: { 'x-test': '1' }, user, space }
      const expected = { config: 'ok', mode: FILE_MODE.EDIT }
      filesOnlyOfficeManagerMock.getSettings.mockResolvedValue(expected)

      const result = await controller.onlyOfficeSettings(req)

      expect(filesOnlyOfficeManagerMock.getSettings).toHaveBeenCalledWith(user, space, req)
      expect(result).toBe(expected)
    })
  })

  describe('onlyOfficeDocument', () => {
    it('should delegate to filesMethods.headOrGet with req and res', async () => {
      const req: any = { params: { '*': 'path/to/file' } }
      const res: any = { header: vi.fn(), status: vi.fn().mockReturnThis() }
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
      const expected = { ok: true }
      filesOnlyOfficeManagerMock.callBack.mockResolvedValue(expected)

      const result = await controller.onlyOfficeCallBack(user, space, token)

      expect(filesOnlyOfficeManagerMock.callBack).toHaveBeenCalledTimes(1)
      expect(filesOnlyOfficeManagerMock.callBack).toHaveBeenCalledWith(user, space, token)
      expect(result).toBe(expected)
    })
  })
})
