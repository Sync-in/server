/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { NestFastifyApplication } from '@nestjs/platform-fastify'
import { appBootstrap } from '../../app.bootstrap'
import { TokenResponseDto } from '../../authentication/dto/token-response.dto'
import { AuthManager } from '../../authentication/services/auth-manager.service'
import { dbCheckConnection } from '../../infrastructure/database/utils'
import { API_USERS_AVATAR, API_USERS_ME } from './constants/routes'
import { USER_ROLE } from './constants/user'
import { DeleteUserDto } from './dto/delete-user.dto'
import { UserModel } from './models/user.model'
import { AdminUsersManager } from './services/admin-users-manager.service'
import { generateUserTest } from './utils/test'

describe('Users (e2e)', () => {
  let app: NestFastifyApplication
  let authManager: AuthManager
  let adminUsersManager: AdminUsersManager
  let userTest: UserModel
  let tokens: TokenResponseDto

  beforeAll(async () => {
    app = await appBootstrap()
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
    authManager = app.get<AuthManager>(AuthManager)
    adminUsersManager = app.get<AdminUsersManager>(AdminUsersManager)
    userTest = new UserModel(generateUserTest(false), false)
  })

  afterAll(async () => {
    await expect(
      adminUsersManager.deleteUserOrGuest(userTest.id, userTest.login, { deleteSpace: true, isGuest: false } satisfies DeleteUserDto)
    ).resolves.not.toThrow()
    await app.close()
  })

  it('should be defined', () => {
    expect(authManager).toBeDefined()
    expect(adminUsersManager).toBeDefined()
    expect(userTest).toBeDefined()
  })

  it('should get the database connection', async () => {
    expect(await dbCheckConnection(app)).toBe(true)
  })

  it(`GET ${API_USERS_ME} => 401`, async () => {
    const res = await app.inject({
      method: 'GET',
      url: API_USERS_ME
    })
    expect(res.statusCode).toEqual(401)
  })

  it(`GET ${API_USERS_ME} => 200`, async () => {
    userTest = await adminUsersManager.createUserOrGuest(userTest, USER_ROLE.USER)
    expect(userTest.id).toBeDefined()
    tokens = await authManager.getTokens(userTest)
    const res = await app.inject({
      method: 'GET',
      url: API_USERS_ME,
      headers: { authorization: `Bearer ${tokens.access}` }
    })
    expect(res.statusCode).toEqual(200)
    const content = res.json()
    expect(content.user).toBeDefined()
    expect(content.user.id).toBe(userTest.id)
  })

  it(`GET ${API_USERS_AVATAR} => 200`, async () => {
    const res1 = await app.inject({
      method: 'GET',
      url: `${API_USERS_AVATAR}/me`,
      headers: { authorization: `Bearer ${tokens.access}` }
    })
    const res2 = await app.inject({
      method: 'GET',
      url: `${API_USERS_AVATAR}/${userTest.login}`,
      headers: { authorization: `Bearer ${tokens.access}` }
    })
    for (const res of [res1, res2]) {
      expect(res.statusCode).toEqual(200)
      expect(res.rawPayload).toBeInstanceOf(Buffer)
      expect(res.rawPayload.byteLength).toBeGreaterThan(1)
    }
    expect((res1.raw.req as any).user).toBe((res2.raw.req as any).user)
    expect(res1.rawPayload.byteLength).toEqual(res2.rawPayload.byteLength)
  })
})
