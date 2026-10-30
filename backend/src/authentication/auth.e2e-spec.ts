import { JwtService } from '@nestjs/jwt'
import { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { Socket } from 'socket.io'
import { z } from 'zod'
import { appBootstrap } from '../app.bootstrap.js'
import { USER_PERMISSION, USER_ROLE } from '../applications/users/constants/user.js'
import type { CreateUserDto } from '../applications/users/dto/create-or-update-user.dto.js'
import type { DeleteUserDto } from '../applications/users/dto/delete-user.dto.js'
import { UserModel } from '../applications/users/models/user.model.js'
import { AdminUsersManager } from '../applications/users/services/admin-users-manager.service.js'
import { UsersManager } from '../applications/users/services/users-manager.service.js'
import { UsersQueries } from '../applications/users/services/users-queries.service.js'
import { generateUserTest } from '../applications/users/utils/test.js'
import { XML_CONTENT_TYPE } from '../applications/webdav/constants/webdav.js'
import { convertHumanTimeToSeconds } from '../common/functions.js'
import { currentTimeStamp, decodeUrl } from '../common/shared.js'
import { configuration } from '../configuration/config.environment.js'
import { Cache } from '../infrastructure/cache/cache.service.js'
import { dbCheckConnection } from '../infrastructure/database/utils.js'
import { WebSocketAdapter } from '../infrastructure/websocket/adapters/web-socket.adapter.js'
import type { AuthenticatedSocketIO } from '../infrastructure/websocket/interfaces/auth-socket-io.interface.js'
import { AuthConfig } from './auth.config.js'
import { CSRF_ERROR, TOKEN_PATHS, TOKEN_TYPES } from './constants/auth.js'
import { API_AUTH_LOGIN, API_AUTH_LOGOUT, API_AUTH_REFRESH, API_AUTH_TOKEN, API_AUTH_TOKEN_REFRESH } from './constants/routes.js'
import { AUTH_SCOPE } from './constants/scope.js'
import { tokenResponseSchema } from './dto/token-response.dto.js'
import type { JwtPayload } from './interfaces/jwt-payload.interface.js'
import { TOKEN_TYPE } from './interfaces/token.interface.js'
import { genWebDAVAuthCacheKey } from './utils/auth-cache.js'

const browserRefreshResponseSchema = z.object({
  user: z.object({
    id: z.number().int()
  }),
  token: z.object({
    access_expiration: z.number().int(),
    refresh_expiration: z.number().int()
  })
})

type CookieTokenType = keyof typeof TOKEN_PATHS

describe('Auth (e2e)', () => {
  let app: NestFastifyApplication
  let authConfig: AuthConfig
  let jwtService: JwtService
  let adminUsersManager: AdminUsersManager
  let usersManager: UsersManager
  let usersQueries: UsersQueries
  let cache: Cache
  let userTest: UserModel
  let refreshToken: string
  let wsToken: string
  let csrfToken: string
  let clientAddress: string

  beforeAll(async () => {
    app = await appBootstrap()
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
    authConfig = configuration.auth
    jwtService = app.get<JwtService>(JwtService)
    adminUsersManager = app.get<AdminUsersManager>(AdminUsersManager)
    usersManager = app.get<UsersManager>(UsersManager)
    usersQueries = app.get<UsersQueries>(UsersQueries)
    cache = app.get<Cache>(Cache)
    userTest = new UserModel(generateUserTest(false), false)
    // The rate-limit cache is shared across runs; use one suite-specific tracker to avoid stale counters.
    clientAddress = `auth-e2e-${userTest.login}`
  })

  afterAll(async () => {
    await expect(
      adminUsersManager.deleteUserOrGuest(userTest.id, userTest.login, { deleteSpace: true } satisfies DeleteUserDto)
    ).resolves.not.toThrow()
    await app.close()
  })

  it('should be defined', () => {
    expect(authConfig).toBeDefined()
    expect(jwtService).toBeDefined()
    expect(adminUsersManager).toBeDefined()
    expect(usersManager).toBeDefined()
    expect(usersQueries).toBeDefined()
    expect(cache).toBeDefined()
    expect(userTest).toBeDefined()
  })

  it('should get the database connection', async () => {
    expect(await dbCheckConnection(app)).toBe(true)
  })

  it(`POST ${API_AUTH_LOGIN} => 401`, async () => {
    const res = await app.inject({
      method: 'POST',
      url: API_AUTH_LOGIN,
      remoteAddress: clientAddress,
      body: { login: userTest.login, password: userTest.password }
    })
    expect(res.statusCode).toEqual(401)
  })

  it(`POST ${API_AUTH_LOGIN} => 201`, async () => {
    const userId = (await adminUsersManager.createUserOrGuest({ ...userTest, permissions: USER_PERMISSION.WEBDAV } as CreateUserDto, USER_ROLE.USER))
      .id
    expect(userId).toBeDefined()
    userTest.id = userId
    const res = await app.inject({
      method: 'POST',
      url: API_AUTH_LOGIN,
      remoteAddress: clientAddress,
      body: { login: userTest.login, password: userTest.password }
    })
    expect(res.statusCode).toEqual(201)
    expect(Object.keys(res.json())).toEqual(expect.arrayContaining(['user', 'token']))
    expect(res.headers['set-cookie']).toHaveLength(4)
    const cookies: { type: CookieTokenType; content: string[] }[] = getCookies(res.headers['set-cookie'] as string[])
    /* Access cookie
        [
        'sync-in-access=value,
        'Max-Age=3600',
        'Path=/',
        'HttpOnly',
        'Secure',
        'SameSite=Strict'
        ]
     */
    /* Refresh cookie
        [
        'sync-in-refresh=value,
        'Max-Age=14400',
        'Path=/api/auth/refresh',
        'HttpOnly',
        'Secure',
        'SameSite=Strict'
        ]
     */
    /* WS cookie
        [
        'sync-in-ws=value,
        'Max-Age=14400',
        'Path=/socket.io',
        'HttpOnly',
        'Secure',
        'SameSite=Strict'
        ]
     */
    /* CSRF cookie
        [
        'sync-in-csrf=value,
        'Max-Age=14400',
        'Path=/',
        'Secure',
        'SameSite=Strict'
        ]
     */
    cookiesChecks(cookies)
    // Verify token
    for (const cookie of cookies) {
      const token = cookie.content[0].substring(cookie.content[0].indexOf('=') + 1)
      if (cookie.type === TOKEN_TYPE.CSRF) {
        // needed for the following tests
        csrfToken = decodeUrl(token)
        continue
      }
      const decodedToken: JwtPayload = await jwtService.verifyAsync(token, {
        secret: authConfig.token[cookie.type].secret
      })
      expect(decodedToken.iat).toBeCloseTo(currentTimeStamp(), -1)
      expect(decodedToken.exp).toBeCloseTo(currentTimeStamp() + convertHumanTimeToSeconds(authConfig.token[cookie.type].expiration), -1)
      expect(decodedToken.tokenType).toBe(cookie.type)
      expect(decodedToken.identity.id).toBe(userTest.id)
      if (cookie.type === TOKEN_TYPE.REFRESH) {
        // needed for the following tests
        refreshToken = token
      }
      if (cookie.type === TOKEN_TYPE.WS) {
        wsToken = token
      }
    }
  })

  it('should authenticate the WebSocket adapter with the issued cookie', async () => {
    const adapter = new WebSocketAdapter(app)
    const socket = {
      request: { headers: { cookie: `${authConfig.token.ws.name}=${wsToken}` } },
      handshake: {
        address: '127.0.0.1',
        headers: { 'user-agent': 'vitest' },
        url: '/socket.io/?EIO=4&transport=websocket'
      },
      id: 'auth-e2e-socket'
    } as unknown as Socket
    const next = vi.fn<(error?: Error) => void>()

    await adapter['authenticateSocket'](socket, next)

    expect(next).toHaveBeenCalledOnce()
    expect(next).toHaveBeenCalledWith()
    expect((socket as AuthenticatedSocketIO).user).toMatchObject({ id: userTest.id, login: userTest.login })
  })

  it(`POST ${API_AUTH_LOGIN} does not reveal an inactive account with an invalid password`, async () => {
    const invalidPassword = 'invalid-password'
    await usersQueries.updateUserOrGuest(userTest.id, { isActive: false })
    try {
      const unknown = await app.inject({
        method: 'POST',
        url: API_AUTH_LOGIN,
        remoteAddress: clientAddress,
        body: { login: `${userTest.login}-missing`, password: invalidPassword }
      })
      const inactive = await app.inject({
        method: 'POST',
        url: API_AUTH_LOGIN,
        remoteAddress: clientAddress,
        body: { login: userTest.login, password: invalidPassword }
      })

      expect(inactive.statusCode).toBe(401)
      expect(inactive.json()).toEqual(unknown.json())

      const verified = await app.inject({
        method: 'POST',
        url: API_AUTH_LOGIN,
        remoteAddress: clientAddress,
        body: { login: userTest.login, password: userTest.password }
      })
      expect(verified.statusCode).toBe(403)
    } finally {
      await usersQueries.updateUserOrGuest(userTest.id, { isActive: true })
    }
  })

  it(`POST ${API_AUTH_LOGOUT} => 201`, async () => {
    const res = await app.inject({
      method: 'POST',
      url: API_AUTH_LOGOUT,
      body: null as never
    })
    expect(res.statusCode).toEqual(201)
    const setCookies = res.headers['set-cookie'] as string[]
    expect(setCookies).toHaveLength(5)
    expectClearedCookie(setCookies, authConfig.token.access.name, TOKEN_PATHS[TOKEN_TYPE.ACCESS], true)
    expectClearedCookie(setCookies, authConfig.token.refresh.name, TOKEN_PATHS[TOKEN_TYPE.REFRESH], true)
    expectClearedCookie(setCookies, authConfig.token.ws.name, TOKEN_PATHS[TOKEN_TYPE.WS], true)
    expectClearedCookie(setCookies, authConfig.token.csrf.name, TOKEN_PATHS[TOKEN_TYPE.CSRF], true)
    expectClearedCookie(setCookies, authConfig.token.access.name, TOKEN_PATHS[TOKEN_TYPE.ACCESS_2FA], true)
    /* Access cookie
     [
       'sync-in-access=',
       'Max-Age=0',
       'Path=/',
       'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
       'HttpOnly',
       'Secure',
       'SameSite=Strict'
     ]
    */
    /* Refresh cookie
      [
        'sync-in-refresh=',
        'Max-Age=0',
        'Path=/api/auth/refresh',
        'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
        'HttpOnly',
        'Secure',
        'SameSite=Strict'
      ]
    */
    /* WS cookie
      [
        'sync-in-ws=',
        'Max-Age=0',
        'Path=/socket.io',
        'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
        'HttpOnly',
        'Secure',
        'SameSite=Strict'
      ]
    */
    /* CSRF cookie
      [
        'sync-in-csrf=',
        'Max-Age=0',
        'Path=/',
        'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
        'HttpOnly',
        'Secure',
        'SameSite=Strict'
      ]
    */
    /* Access cookie 2FA
      [
        'sync-in-access=',
        'Max-Age=0',
        'Path=/api/auth/2fa/login/verify',
        'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
        'HttpOnly',
        'Secure',
        'SameSite=Strict'
      ]
    */
  })

  it(`POST ${API_AUTH_REFRESH} => 201`, async () => {
    const res = await app.inject({
      method: 'POST',
      headers: { [authConfig.token.csrf.name]: csrfToken },
      url: API_AUTH_REFRESH,
      cookies: { [authConfig.token.refresh.name]: refreshToken }
    })
    expect(res.statusCode).toEqual(201)
    const content = browserRefreshResponseSchema.parse(res.json())
    expect(content.user.id).toBe(userTest.id)
    const expectedAccessExpiration = currentTimeStamp() + convertHumanTimeToSeconds(authConfig.token.access.expiration)
    expect(content.token.access_expiration).toBeCloseTo(expectedAccessExpiration, -1)
    const cookies: { type: CookieTokenType; content: string[] }[] = getCookies(res.headers['set-cookie'] as string[])
    cookiesChecks(cookies)
  })

  it(`POST ${API_AUTH_REFRESH} => 401 (with CSRF)`, async () => {
    const res = await app.inject({
      method: 'POST',
      url: API_AUTH_REFRESH,
      headers: { [authConfig.token.csrf.name]: csrfToken },
      cookies: { [authConfig.token.refresh.name]: 'bar' }
    })
    expect(res.statusCode).toEqual(401)
  })

  it(`POST ${API_AUTH_REFRESH} => 403 (without CSRF)`, async () => {
    const res = await app.inject({
      method: 'POST',
      url: API_AUTH_REFRESH,
      cookies: { [authConfig.token.refresh.name]: refreshToken }
    })
    expect(res.statusCode).toEqual(403)
    expect(res.json().message).toEqual(CSRF_ERROR.MISSING_HEADERS)
  })

  it(`POST ${API_AUTH_TOKEN} => 401`, async () => {
    const res = await app.inject({
      method: 'POST',
      url: API_AUTH_TOKEN,
      remoteAddress: clientAddress,
      body: { login: userTest.login, password: 'bar' }
    })
    expect(res.statusCode).toEqual(401)
  })

  it(`POST ${API_AUTH_TOKEN} => 201`, async () => {
    const res = await app.inject({
      method: 'POST',
      url: API_AUTH_TOKEN,
      remoteAddress: clientAddress,
      body: { login: userTest.login, password: userTest.password }
    })
    expect(res.statusCode).toEqual(201)
    const content = res.json()
    expect(() => tokenResponseSchema.parse(content)).not.toThrow()
    for (const type of TOKEN_TYPES.filter((p) => p === TOKEN_TYPE.ACCESS || p === TOKEN_TYPE.REFRESH)) {
      expect(content[type]).toBeDefined()
      expect(content[`${type}_expiration`]).toBeCloseTo(currentTimeStamp() + convertHumanTimeToSeconds(authConfig.token[type].expiration), -1)
    }
  })

  it(`POST ${API_AUTH_TOKEN_REFRESH} => 401`, async () => {
    const res = await app.inject({
      method: 'POST',
      url: API_AUTH_TOKEN_REFRESH,
      headers: { authorization: 'Bearer bar' }
    })
    expect(res.statusCode).toEqual(401)
  })

  it(`POST ${API_AUTH_TOKEN_REFRESH} => 201`, async () => {
    const res = await app.inject({
      method: 'POST',
      url: API_AUTH_TOKEN_REFRESH,
      headers: { authorization: `Bearer ${refreshToken}` }
    })
    expect(res.statusCode).toEqual(201)
    expect(() => tokenResponseSchema.parse(res.json())).not.toThrow()
  })

  it('should invalidate cached WebDAV app-password authentication after revocation', async () => {
    const passwordName = 'webdav-cache-revocation'
    const appPassword = await usersManager.generateAppPassword(userTest, { name: passwordName, app: AUTH_SCOPE.WEBDAV })
    const cacheKey = webDAVAuthCacheKey(appPassword.password)

    try {
      const authenticated = await webDAVRequest(appPassword.password)
      expect(authenticated.statusCode).toBe(207)
      await vi.waitFor(async () => {
        expect(await cache.get(cacheKey)).toEqual(expect.objectContaining({ id: userTest.id }))
      })

      await usersManager.deleteAppPassword(userTest, passwordName)

      expect(await cache.get(cacheKey)).toBeUndefined()
      const revoked = await webDAVRequest(appPassword.password)
      expect(revoked.statusCode).toBe(401)
      expect(await cache.get(cacheKey)).toBeUndefined()
    } finally {
      await deleteAppPasswordIfPresent(passwordName)
      await cache.del(cacheKey)
    }
  })

  it('should not restore a revoked app password when WebDAV authentication is in flight', async () => {
    const passwordName = 'webdav-in-flight-revocation'
    const appPassword = await usersManager.generateAppPassword(userTest, { name: passwordName, app: AUTH_SCOPE.WEBDAV })
    const cacheKey = webDAVAuthCacheKey(appPassword.password)
    const getUserSecrets = usersQueries.getUserSecrets.bind(usersQueries)
    let secretsRead!: () => void
    const secretsWereRead = new Promise<void>((resolve) => (secretsRead = resolve))
    let resumeValidation!: () => void
    const revocationCompleted = new Promise<void>((resolve) => (resumeValidation = resolve))
    // Keep the stale read suspended until revocation commits, then let validation enter its bcrypt comparison.
    const getUserSecretsSpy = vi.spyOn(usersQueries, 'getUserSecrets').mockImplementationOnce(async (userId) => {
      const secrets = await getUserSecrets(userId)
      secretsRead()
      await revocationCompleted
      return secrets
    })

    try {
      const authentication = webDAVRequest(appPassword.password)
      await secretsWereRead
      await usersManager.deleteAppPassword(userTest, passwordName)
      resumeValidation()

      expect((await authentication).statusCode).toBe(401)
      expect(await usersManager.listAppPasswords(userTest)).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: passwordName })]))
    } finally {
      resumeValidation()
      getUserSecretsSpy.mockRestore()
      await deleteAppPasswordIfPresent(passwordName)
      await cache.del(cacheKey)
    }
  })

  function getCookies(setCookie: string[]): { type: CookieTokenType; content: string[] }[] {
    const cookies: { type: CookieTokenType; content: string[] }[] = []
    for (const c of setCookie) {
      const cookieName = c.split('=')[0]
      const cookieValues = c.split('; ')
      switch (cookieName) {
        case authConfig.token.access.name:
          cookies.push({ type: TOKEN_TYPE.ACCESS, content: cookieValues })
          break
        case authConfig.token.refresh.name:
          cookies.push({ type: TOKEN_TYPE.REFRESH, content: cookieValues })
          break
        case authConfig.token.ws.name:
          cookies.push({ type: TOKEN_TYPE.WS, content: cookieValues })
          break
        case authConfig.token.csrf.name:
          cookies.push({ type: TOKEN_TYPE.CSRF, content: cookieValues })
          break
      }
    }
    return cookies
  }

  function cookiesChecks(cookies: { type: CookieTokenType; content: string[] }[], clear = false) {
    for (const cookie of cookies) {
      expect(cookie.content[0].split('=')[0]).toBe(authConfig.token[cookie.type].name)
      expect(cookie.content[2].split('=')[1]).toBe(TOKEN_PATHS[cookie.type])
      if (cookie.type === TOKEN_TYPE.CSRF) {
        expect(cookie.content).not.toContain('HttpOnly')
      } else {
        expect(cookie.content).toContain('HttpOnly')
      }
      expect(cookie.content).not.toContain('Secure')
      expect(cookie.content[cookie.content.length - 1].split('=')[1].toLowerCase()).toBe(authConfig.cookieSameSite)
      if (clear) {
        expect(cookie.content[0].split('=')[1]).toBe('')
        expect(cookie.content[1].split('=')[1]).toBe('0')
        expect(cookie.content[3].split('=')[1]).toBe('Thu, 01 Jan 1970 00:00:00 GMT')
      } else {
        expect(parseInt(cookie.content[1].split('=')[1])).toBeCloseTo(convertHumanTimeToSeconds(authConfig.token[cookie.type].expiration), -1)
        expect(cookie.content[0].split('=')[1]).not.toBe('')
      }
    }
  }

  function expectClearedCookie(setCookies: string[], name: string, path: string, httpOnly: boolean): void {
    const serializedCookie = setCookies.find((cookie) => {
      const content = cookie.split('; ')
      return content[0].startsWith(`${name}=`) && content.includes(`Path=${path}`)
    })
    expect(serializedCookie).toBeDefined()
    const content = serializedCookie!.split('; ')
    expect(content[0]).toBe(`${name}=`)
    expect(content).toContain('Max-Age=0')
    expect(content).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT')
    expect(content).toContain(`Path=${path}`)
    expect(content.includes('HttpOnly')).toBe(httpOnly)
    expect(content).not.toContain('Secure')
    expect(content.some((attribute) => attribute.toLowerCase() === `samesite=${authConfig.cookieSameSite}`)).toBe(true)
  }

  function webDAVRequest(password: string) {
    const authorization = Buffer.from(`${userTest.login}:${password}`).toString('base64')
    return app.inject({
      method: 'PROPFIND',
      url: '/webdav',
      headers: { authorization: `Basic ${authorization}`, 'content-type': XML_CONTENT_TYPE, depth: '0' },
      body: '<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><allprop/></propfind>'
    } as any)
  }

  function webDAVAuthCacheKey(password: string): string {
    return genWebDAVAuthCacheKey(userTest.login, password, authConfig.token.access.secret)
  }

  async function deleteAppPasswordIfPresent(passwordName: string): Promise<void> {
    if ((await usersManager.listAppPasswords(userTest)).some(({ name }) => name === passwordName)) {
      await usersManager.deleteAppPassword(userTest, passwordName)
    }
  }
})
