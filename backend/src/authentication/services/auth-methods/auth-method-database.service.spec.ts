/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Test, TestingModule } from '@nestjs/testing'
import { CONNECT_ERROR_CODE } from '../../../app.constants'
import { UserModel } from '../../../applications/users/models/user.model'
import { AdminUsersManager } from '../../../applications/users/services/admin-users-manager.service'
import { AdminUsersQueries } from '../../../applications/users/services/admin-users-queries.service'
import { UsersManager } from '../../../applications/users/services/users-manager.service'
import { UsersQueries } from '../../../applications/users/services/users-queries.service'
import { generateUserTest } from '../../../applications/users/utils/test'
import { hashPassword } from '../../../common/functions'
import { Cache } from '../../../infrastructure/cache/services/cache.service'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import { AuthManager } from '../auth-manager.service'
import { AuthMethodDatabase } from './auth-method-database.service'

describe(AuthMethodDatabase.name, () => {
  let authMethodDatabase: AuthMethodDatabase
  let usersManager: UsersManager
  let userTest: UserModel

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthMethodDatabase,
        UsersManager,
        UsersQueries,
        AdminUsersManager,
        AdminUsersQueries,
        { provide: AuthManager, useValue: {} },
        { provide: DB_TOKEN_PROVIDER, useValue: {} },
        {
          provide: Cache,
          useValue: {}
        }
      ]
    }).compile()

    authMethodDatabase = module.get<AuthMethodDatabase>(AuthMethodDatabase)
    usersManager = module.get<UsersManager>(UsersManager)
    module.useLogger(['fatal'])
    // mocks
    userTest = new UserModel(generateUserTest(), false)
    usersManager.updateAccesses = jest.fn(() => Promise.resolve())
  })

  it('should be defined', () => {
    expect(authMethodDatabase).toBeDefined()
    expect(usersManager).toBeDefined()
    expect(userTest).toBeDefined()
  })

  it('should validate the user', async () => {
    userTest.makePaths = jest.fn()
    usersManager.findUser = jest.fn().mockReturnValue({ ...userTest, password: await hashPassword(userTest.password) })
    expect(await authMethodDatabase.validateUser(userTest.login, userTest.password)).toBeDefined()
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
    expect(await authMethodDatabase.validateUser(userTest.login, userTest.password)).toBeNull()
    expect(await authMethodDatabase.validateUser(userTest.login, userTest.password)).toBeNull()
    await expect(authMethodDatabase.validateUser(userTest.login, userTest.password)).rejects.toThrow(/db error/i)
    await expect(authMethodDatabase.validateUser(userTest.login, userTest.password)).rejects.toThrow(/authentication service/i)
  })
})
