import { NestFastifyApplication } from '@nestjs/platform-fastify'
import { appBootstrap } from '../../app.bootstrap'
import { AuthManager } from '../../authentication/auth.service'
import { TokenResponseDto } from '../../authentication/dto/token-response.dto'
import { dbCheckConnection } from '../../infrastructure/database/utils'
import { API_USERS_AVATAR, API_USERS_ME } from './constants/routes'
import { USER_ROLE } from './constants/user'
import { DeleteUserDto } from './dto/delete-user.dto'
import { UserModel } from './models/user.model'
import { AdminUsersManager } from './services/admin-users-manager.service'
import { UsersQueries } from './services/users-queries.service'
import { generateUserTest } from './utils/test'

describe('Users (e2e)', () => {
  let app: NestFastifyApplication
  let authManager: AuthManager
  let adminUsersManager: AdminUsersManager
  let usersQueries: UsersQueries
  let userTest: UserModel
  let legacyUserTest: UserModel
  let tokens: TokenResponseDto

  beforeAll(async () => {
    app = await appBootstrap()
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
    authManager = app.get<AuthManager>(AuthManager)
    adminUsersManager = app.get<AdminUsersManager>(AdminUsersManager)
    usersQueries = app.get<UsersQueries>(UsersQueries)
    userTest = new UserModel(generateUserTest(false), false)
    legacyUserTest = new UserModel(generateUserTest(false), false)
  })

  afterAll(async () => {
    for (const user of [userTest, legacyUserTest]) {
      if (user.id) {
        await expect(adminUsersManager.deleteUserOrGuest(user.id, user.login, { deleteSpace: true } satisfies DeleteUserDto)).resolves.not.toThrow()
      }
    }
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

  it('should bind and resolve external identities in the database', async () => {
    const externalId = 'SUBJECT-1'
    legacyUserTest = await adminUsersManager.createUserOrGuest(legacyUserTest, USER_ROLE.USER)

    expect(await usersQueries.bindExternalId(userTest.id, externalId)).toBe(true)
    expect((await usersQueries.from(userTest.id)).externalId).toBe(externalId)
    expect(await usersQueries.bindExternalId(userTest.id, externalId)).toBe(true)
    expect(await usersQueries.bindExternalId(userTest.id, 'subject-1')).toBe(false)
    expect(await usersQueries.bindExternalId(0, externalId)).toBe(false)

    const emailFallback = await usersQueries.fromExternalIdOrEmail('unknown-subject', legacyUserTest.email)
    expect(emailFallback.id).toBe(legacyUserTest.id)

    const externalIdPriority = await usersQueries.fromExternalIdOrEmail(externalId, legacyUserTest.email)
    expect(externalIdPriority.id).toBe(userTest.id)

    const concurrentExternalIds = ['CONCURRENT-SUBJECT-1', 'CONCURRENT-SUBJECT-2']
    const concurrentBindings = await Promise.all(
      concurrentExternalIds.map((concurrentExternalId) => usersQueries.bindExternalId(legacyUserTest.id, concurrentExternalId))
    )
    expect(concurrentBindings.filter(Boolean)).toHaveLength(1)
    expect(concurrentExternalIds).toContain((await usersQueries.from(legacyUserTest.id)).externalId)
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
