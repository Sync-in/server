import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { NestFastifyApplication } from '@nestjs/platform-fastify'
import { appBootstrap } from '../app.bootstrap'
import { USER_ROLE } from '../applications/users/constants/user'
import { DeleteUserDto } from '../applications/users/dto/delete-user.dto'
import { UserModel } from '../applications/users/models/user.model'
import { AdminUsersManager } from '../applications/users/services/admin-users-manager.service'
import { generateUserTest } from '../applications/users/utils/test'
import { convertHumanTimeToSeconds, transformAndValidate } from '../common/functions'
import { currentTimeStamp, decodeUrl } from '../common/shared'
import { dbCheckConnection } from '../infrastructure/database/utils'
import { AuthConfig } from './auth.config'
import { CSRF_ERROR, TOKEN_PATHS, TOKEN_TYPES } from './constants/auth'
import { API_AUTH_LOGIN, API_AUTH_LOGOUT, API_AUTH_REFRESH, API_AUTH_TOKEN, API_AUTH_TOKEN_REFRESH } from './constants/routes'
import { TokenResponseDto } from './dto/token-response.dto'
import { JwtPayload } from './interfaces/jwt-payload.interface'
import { TOKEN_TYPE } from './interfaces/token.interface'

describe('Auth (e2e)', () => {
  let app: NestFastifyApplication
  let authConfig: AuthConfig
  let jwtService: JwtService
  let adminUsersManager: AdminUsersManager
  let userTest: UserModel
  let refreshToken: string
  let csrfToken: string

  beforeAll(async () => {
    app = await appBootstrap()
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
    authConfig = app.get<ConfigService>(ConfigService).get<AuthConfig>('auth')
    jwtService = app.get<JwtService>(JwtService)
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
    expect(authConfig).toBeDefined()
    expect(jwtService).toBeDefined()
    expect(adminUsersManager).toBeDefined()
    expect(userTest).toBeDefined()
  })

  it('should get the database connection', async () => {
    expect(await dbCheckConnection(app)).toBe(true)
  })

  it(`POST ${API_AUTH_LOGIN} => 401`, async () => {
    const res = await app.inject({
      method: 'POST',
      url: API_AUTH_LOGIN,
      body: { login: userTest.login, password: userTest.password }
    })
    expect(res.statusCode).toEqual(401)
  })

  it(`POST ${API_AUTH_LOGIN} => 201`, async () => {
    const userId = (await adminUsersManager.createUserOrGuest({ ...userTest }, USER_ROLE.USER)).id
    expect(userId).toBeDefined()
    userTest.id = userId
    const res = await app.inject({
      method: 'POST',
      url: API_AUTH_LOGIN,
      body: { login: userTest.login, password: userTest.password }
    })
    expect(res.statusCode).toEqual(201)
    expect(Object.keys(res.json())).toEqual(expect.arrayContaining(['user', 'token']))
    expect(res.headers['set-cookie']).toHaveLength(4)
    const cookies: { type: TOKEN_TYPE; content: string[] }[] = getCookies(res.headers['set-cookie'] as string[])
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
      expect(decodedToken.identity.id).toBe(userTest.id)
      if (cookie.type === TOKEN_TYPE.REFRESH) {
        // needed for the following tests
        refreshToken = token
      }
    }
  })

  it(`POST ${API_AUTH_LOGOUT} => 201`, async () => {
    const res = await app.inject({
      method: 'POST',
      url: API_AUTH_LOGOUT,
      body: null
    })
    expect(res.statusCode).toEqual(201)
    expect(res.headers['set-cookie']).toHaveLength(5)
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
        'Path=/api/auth/refresh',
        'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
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
    const cookies: { type: TOKEN_TYPE; content: string[] }[] = getCookies(res.headers['set-cookie'] as string[])
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
      body: { login: userTest.login, password: 'bar' }
    })
    expect(res.statusCode).toEqual(401)
  })

  it(`POST ${API_AUTH_TOKEN} => 201`, async () => {
    const res = await app.inject({
      method: 'POST',
      url: API_AUTH_TOKEN,
      body: { login: userTest.login, password: userTest.password }
    })
    expect(res.statusCode).toEqual(201)
    const content = res.json()
    expect(() => transformAndValidate(TokenResponseDto, content)).not.toThrow()
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
    expect(() => transformAndValidate(TokenResponseDto, res.json())).not.toThrow()
  })

  function getCookies(setCookie: string[]): { type: TOKEN_TYPE; content: string[] }[] {
    const cookies: { type: TOKEN_TYPE; content: string[] }[] = []
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

  function cookiesChecks(cookies: { type: TOKEN_TYPE; content: string[] }[], clear = false) {
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
})
