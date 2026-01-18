/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Test, TestingModule } from '@nestjs/testing'
import { CONNECT_ERROR_CODE } from '../../../app.constants'
import { NotificationsManager } from '../../../applications/notifications/services/notifications-manager.service'
import { UserModel } from '../../../applications/users/models/user.model'
import { AdminUsersManager } from '../../../applications/users/services/admin-users-manager.service'
import { AdminUsersQueries } from '../../../applications/users/services/admin-users-queries.service'
import { UsersManager } from '../../../applications/users/services/users-manager.service'
import { UsersQueries } from '../../../applications/users/services/users-queries.service'
import { generateUserTest } from '../../../applications/users/utils/test'
import { hashPassword } from '../../../common/functions'
import { Cache } from '../../../infrastructure/cache/services/cache.service'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import { AuthManager } from '../../auth.service'
import { AuthProviderMySQL } from './auth-provider-mysql.service'

describe(AuthProviderMySQL.name, () => {
  let authProviderMySQL: AuthProviderMySQL
  let usersManager: UsersManager
  let userTest: UserModel

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthProviderMySQL,
        UsersManager,
        UsersQueries,
        AdminUsersManager,
        AdminUsersQueries,
        { provide: AuthManager, useValue: {} },
        { provide: DB_TOKEN_PROVIDER, useValue: {} },
        { provide: Cache, useValue: {} },
        { provide: NotificationsManager, useValue: {} }
      ]
    }).compile()

    authProviderMySQL = module.get<AuthProviderMySQL>(AuthProviderMySQL)
    usersManager = module.get<UsersManager>(UsersManager)
    module.useLogger(['fatal'])
    // mocks
    userTest = new UserModel(generateUserTest(), false)
    usersManager.updateAccesses = jest.fn(() => Promise.resolve())
  })

  it('should be defined', () => {
    expect(authProviderMySQL).toBeDefined()
    expect(usersManager).toBeDefined()
    expect(userTest).toBeDefined()
  })

  it('should validate the user', async () => {
    userTest.makePaths = jest.fn()
    usersManager.findUser = jest.fn().mockReturnValue({ ...userTest, password: await hashPassword(userTest.password) })
    expect(await authProviderMySQL.validateUser(userTest.login, userTest.password)).toBeDefined()
    expect(userTest.makePaths).toHaveBeenCalled()
  })

  it('should not validate the user', async () => {
    usersManager.findUser = jest
      .fn()
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ ...userTest, password: await hashPassword('bar') })
      .mockRejectedValueOnce({ message: 'db error', code: 'OTHER' })
      .mockRejectedValueOnce(
        new Error('Authentication service error', {
          cause: { code: Array.from(CONNECT_ERROR_CODE)[0] }
        })
      )
    expect(await authProviderMySQL.validateUser(userTest.login, userTest.password)).toBeNull()
    expect(await authProviderMySQL.validateUser(userTest.login, userTest.password)).toBeNull()
    await expect(authProviderMySQL.validateUser(userTest.login, userTest.password)).rejects.toThrow(/db error/i)
    await expect(authProviderMySQL.validateUser(userTest.login, userTest.password)).rejects.toThrow(/authentication service/i)
  })
})
