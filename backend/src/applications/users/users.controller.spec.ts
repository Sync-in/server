/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { ConfigModule } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Test, TestingModule } from '@nestjs/testing'
import { AuthManager } from '../../authentication/auth.service'
import { AuthProvider2FA } from '../../authentication/providers/two-fa/auth-provider-two-fa.service'
import { exportConfiguration } from '../../configuration/config.environment'
import { Cache } from '../../infrastructure/cache/services/cache.service'
import { DB_TOKEN_PROVIDER } from '../../infrastructure/database/constants'
import { NotificationsManager } from '../notifications/services/notifications-manager.service'
import { UserModel } from './models/user.model'
import { AdminUsersManager } from './services/admin-users-manager.service'
import { AdminUsersQueries } from './services/admin-users-queries.service'
import { UsersManager } from './services/users-manager.service'
import { UsersQueries } from './services/users-queries.service'
import { UsersController } from './users.controller'
import { generateUserTest } from './utils/test'

describe(UsersController.name, () => {
  let module: TestingModule
  let userController: UsersController
  let usersQueries: UsersQueries
  let adminUsersManager: AdminUsersManager
  let userTest: UserModel

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [await ConfigModule.forRoot({ load: [exportConfiguration], isGlobal: true })],
      controllers: [UsersController],
      providers: [
        { provide: DB_TOKEN_PROVIDER, useValue: {} },
        {
          provide: Cache,
          useValue: {}
        },
        UsersManager,
        UsersQueries,
        AdminUsersManager,
        AdminUsersQueries,
        AuthManager,
        JwtService,
        AuthProvider2FA,
        { provide: NotificationsManager, useValue: {} }
      ]
    }).compile()
    userController = module.get<UsersController>(UsersController)
    usersQueries = module.get<UsersQueries>(UsersQueries)
    adminUsersManager = module.get<AdminUsersManager>(AdminUsersManager)
    userTest = new UserModel(generateUserTest())
  })

  afterAll(async () => {
    await expect(adminUsersManager.deleteUserSpace(userTest.login)).resolves.not.toThrow()
    await module.close()
  })

  it('should be defined', () => {
    expect(userController).toBeDefined()
    expect(usersQueries).toBeDefined()
    expect(userTest).toBeDefined()
  })

  it('should get the user profile', async () => {
    usersQueries.from = jest.fn().mockReturnValue(userTest)
    const profile = await userController.me(userTest)
    expect(usersQueries.from).toHaveBeenCalled()
    expect(profile.user).toBeInstanceOf(UserModel)
    expect(profile.user.login).toBe(userTest.login)
  })

  it('should not generate the user avatar stream', async () => {
    usersQueries.from = jest.fn().mockReturnValueOnce(null)
    await expect(userController.genAvatar(userTest)).rejects.toThrow('does not exist')
  })
})
