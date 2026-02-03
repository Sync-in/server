import { ConfigModule } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Test, TestingModule } from '@nestjs/testing'
import { AuthManager } from '../../authentication/auth.service'
import { AuthProvider2FA } from '../../authentication/providers/two-fa/auth-provider-two-fa.service'
import { AuthTwoFaGuard } from '../../authentication/providers/two-fa/auth-two-fa-guard'
import { exportConfiguration } from '../../configuration/config.environment'
import { Cache } from '../../infrastructure/cache/services/cache.service'
import { DB_TOKEN_PROVIDER } from '../../infrastructure/database/constants'
import { NotificationsManager } from '../notifications/services/notifications-manager.service'
import { AdminUsersController } from './admin-users.controller'
import { AdminUsersManager } from './services/admin-users-manager.service'
import { AdminUsersQueries } from './services/admin-users-queries.service'
import { UsersManager } from './services/users-manager.service'
import { UsersQueries } from './services/users-queries.service'

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
        { provide: AuthTwoFaGuard, useValue: {} },
        { provide: NotificationsManager, useValue: {} },
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
