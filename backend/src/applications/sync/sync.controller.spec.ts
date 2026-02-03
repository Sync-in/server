import { Test, TestingModule } from '@nestjs/testing'
import { ContextManager } from '../../infrastructure/context/services/context-manager.service'
import { SpacesManager } from '../spaces/services/spaces-manager.service'
import { SyncClientsManager } from './services/sync-clients-manager.service'
import { SyncManager } from './services/sync-manager.service'
import { SyncPathsManager } from './services/sync-paths-manager.service'
import { SyncController } from './sync.controller'

describe(SyncController.name, () => {
  let controller: SyncController

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SyncController],
      providers: [
        { provide: ContextManager, useValue: {} },
        { provide: SpacesManager, useValue: {} },
        { provide: SyncManager, useValue: {} },
        { provide: SyncClientsManager, useValue: {} },
        { provide: SyncPathsManager, useValue: {} }
      ]
    }).compile()

    controller = module.get<SyncController>(SyncController)
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })
})
