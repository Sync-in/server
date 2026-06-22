import { Test, TestingModule } from '@nestjs/testing'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { ContextInterceptor } from '../../../../infrastructure/context/interceptors/context.interceptor'
import { ContextManager } from '../../../../infrastructure/context/services/context-manager.service'
import { SpaceGuard } from '../../../spaces/guards/space.guard'
import { SpacesManager } from '../../../spaces/services/spaces-manager.service'
import { FilesMethods } from '../../services/files-methods.service'
import { COLLABORA_CONTEXT } from './collabora-online.constants'
import { CollaboraOnlineManager } from './collabora-online-manager.service'
import { CollaboraOnlineController } from './collabora-online.controller'
import { CollaboraOnlineGuard } from './collabora-online.guard'

describe(CollaboraOnlineController.name, () => {
  let controller: CollaboraOnlineController

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CollaboraOnlineController],
      providers: [
        ContextManager,
        ContextInterceptor,
        { provide: CollaboraOnlineManager, useValue: {} },
        { provide: FilesMethods, useValue: {} },
        { provide: SpacesManager, useValue: {} }
      ]
    }).compile()

    controller = module.get<CollaboraOnlineController>(CollaboraOnlineController)
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })

  it('should use access authentication for settings and editor authentication for WOPI routes', () => {
    expect(Reflect.getMetadata(COLLABORA_CONTEXT, controller.collaboraOnlineSettings)).toBeUndefined()
    expect(Reflect.getMetadata(GUARDS_METADATA, controller.collaboraOnlineSettings)).toEqual([SpaceGuard])

    for (const handler of [
      controller.collaboraOnlineGetDocumentContent,
      controller.collaboraOnlineGetDocumentInfo,
      controller.collaboraOnlineSaveDocument,
      controller.collaboraOnlineManageLockOnDocument
    ]) {
      expect(Reflect.getMetadata(COLLABORA_CONTEXT, handler)).toBe(true)
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([CollaboraOnlineGuard, SpaceGuard])
    }
  })
})
