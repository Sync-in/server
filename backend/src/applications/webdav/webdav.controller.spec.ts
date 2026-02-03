import { Test, TestingModule } from '@nestjs/testing'
import { SpacesManager } from '../spaces/services/spaces-manager.service'
import { WebDAVMethods } from './services/webdav-methods.service'
import { WebDAVSpaces } from './services/webdav-spaces.service'
import { WebDAVController } from './webdav.controller'

describe(WebDAVController.name, () => {
  let davController: WebDAVController

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: WebDAVSpaces, useValue: {} },
        {
          provide: WebDAVMethods,
          useValue: {}
        },
        { provide: SpacesManager, useValue: {} },
        WebDAVController
      ]
    }).compile()

    davController = module.get<WebDAVController>(WebDAVController)
  })

  it('should be defined', () => {
    expect(davController).toBeDefined()
  })
})
