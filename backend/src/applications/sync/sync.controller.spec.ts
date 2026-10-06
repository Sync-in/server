import { Test, TestingModule } from '@nestjs/testing'
import { AuthRateLimitGuard } from '../../authentication/guards/auth-rate-limit.guard.js'
import { SpacesManager } from '../spaces/services/spaces-manager.service.js'
import { SyncClientsManager } from './services/sync-clients-manager.service.js'
import { SyncManager } from './services/sync-manager.service.js'
import { SyncPathsManager } from './services/sync-paths-manager.service.js'
import { SyncController } from './sync.controller.js'

describe(SyncController.name, () => {
  let controller: SyncController

  beforeAll(async () => {
    const testingModuleBuilder = Test.createTestingModule({
      controllers: [SyncController],
      providers: [
        { provide: SpacesManager, useValue: {} },
        { provide: SyncManager, useValue: {} },
        { provide: SyncClientsManager, useValue: {} },
        { provide: SyncPathsManager, useValue: {} }
      ]
    })
    testingModuleBuilder.overrideGuard(AuthRateLimitGuard).useValue({ canActivate: () => true })
    const module: TestingModule = await testingModuleBuilder.compile()

    controller = module.get<SyncController>(SyncController)
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })
})
