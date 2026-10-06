import { ConfigModule } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Test, TestingModule } from '@nestjs/testing'
import { AuthManager } from '../../authentication/auth.service.js'
import { AuthProvider2FA } from '../../authentication/providers/two-fa/auth-provider-two-fa.service.js'
import { AuthTwoFaVerificationGuard } from '../../authentication/providers/two-fa/guards/auth-two-fa-verification.guard.js'
import { exportConfiguration } from '../../configuration/config.environment.js'
import { Cache } from '../../infrastructure/cache/cache.service.js'
import { DB_TOKEN_PROVIDER } from '../../infrastructure/database/constants.js'
import { NotificationsManager } from '../notifications/services/notifications-manager.service.js'
import { AdminUsersController } from './admin-users.controller.js'
import { AdminUsersManager } from './services/admin-users-manager.service.js'
import { AdminUsersQueries } from './services/admin-users-queries.service.js'
import { UsersManager } from './services/users-manager.service.js'
import { UsersQueries } from './services/users-queries.service.js'
import { FilesQuotaManager } from '../files/services/files-quota-manager.service.js'

describe(AdminUsersController.name, () => {
  let controller: AdminUsersController

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [await ConfigModule.forRoot({ load: [exportConfiguration], isGlobal: true })],
      controllers: [AdminUsersController],
      providers: [
        { provide: DB_TOKEN_PROVIDER, useValue: {} },
        {
          provide: Cache,
          useValue: {}
        },
        { provide: AuthProvider2FA, useValue: {} },
        { provide: AuthTwoFaVerificationGuard, useValue: {} },
        { provide: NotificationsManager, useValue: {} },
        {
          provide: FilesQuotaManager,
          useValue: { updateStorageQuota: () => vi.fn() }
        },
        JwtService,
        AuthManager,
        AdminUsersManager,
        AdminUsersQueries,
        UsersManager,
        UsersQueries
      ]
    }).compile()

    controller = module.get<AdminUsersController>(AdminUsersController)
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })
})
