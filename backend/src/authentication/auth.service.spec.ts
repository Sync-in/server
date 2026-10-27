import { JwtService } from '@nestjs/jwt'
import { Test, TestingModule } from '@nestjs/testing'
import { USER_ROLE } from '../applications/users/constants/user.js'
import { UserModel } from '../applications/users/models/user.model.js'
import { convertHumanTimeToSeconds } from '../common/functions.js'
import { currentTimeStamp } from '../common/shared.js'
import { configuration } from '../configuration/config.environment.js'
import { AuthManager } from './auth.service.js'
import { TOKEN_TYPE } from './interfaces/token.interface.js'
import { AUTH_SESSION } from './providers/auth-providers.constants.js'

describe(AuthManager.name, () => {
  const jwtService = { signAsync: vi.fn() }
  let authManager: AuthManager

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthManager, { provide: JwtService, useValue: jwtService }]
    }).compile()

    module.useLogger(['fatal'])
    authManager = module.get<AuthManager>(AuthManager)
  })

  beforeEach(() => {
    jwtService.signAsync.mockReset()
    jwtService.signAsync.mockResolvedValue('token')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should be defined', () => {
    expect(authManager).toBeDefined()
  })

  it('should preserve the authentication method in cookies and response user', async () => {
    const user = new UserModel({
      id: 1,
      login: 'alice',
      email: 'alice@example.com',
      firstName: 'Alice',
      lastName: 'Doe',
      language: 'en',
      role: USER_ROLE.USER,
      preferences: { showHiddenFiles: false }
    })
    const res = { setCookie: vi.fn() }

    const response = await authManager.setCookies(user, res as any, false, AUTH_SESSION.OIDC)

    expect(response.user.authSession).toBe(AUTH_SESSION.OIDC)
    expect(jwtService.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: expect.objectContaining({
          authSession: AUTH_SESSION.OIDC,
          preferences: { showHiddenFiles: false }
        })
      }),
      expect.any(Object)
    )
  })

  it('should preserve the authentication method when refreshing cookies', async () => {
    const user = new UserModel({
      id: 1,
      login: 'alice',
      email: 'alice@example.com',
      firstName: 'Alice',
      lastName: 'Doe',
      language: 'en',
      role: USER_ROLE.USER,
      authSession: AUTH_SESSION.OIDC,
      exp: currentTimeStamp() + 3600
    } as any)
    const res = { setCookie: vi.fn() }

    const response = await authManager.refreshCookies(user, res as any)

    expect(response.user.authSession).toBe(AUTH_SESSION.OIDC)
    expect(jwtService.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: expect.objectContaining({ authSession: AUTH_SESSION.OIDC })
      }),
      expect.any(Object)
    )
  })

  describe('link session bounded by the link expiration', () => {
    const linkUser = () =>
      new UserModel({ id: 5, login: 'guest', language: 'en', role: USER_ROLE.LINK, preferences: { showHiddenFiles: false } } as any)

    it('caps every token and cookie to the link expiration when it is sooner than the configured lifetimes', async () => {
      vi.useFakeTimers()
      const remaining = 60
      const expiresAt = new Date((currentTimeStamp() + remaining) * 1000)
      const res = { setCookie: vi.fn() }

      await authManager.setCookies(linkUser() as any, res as any, false, undefined, expiresAt)

      for (const type of [TOKEN_TYPE.REFRESH, TOKEN_TYPE.ACCESS, TOKEN_TYPE.WS, TOKEN_TYPE.CSRF]) {
        expect(convertHumanTimeToSeconds(configuration.auth.token[type].expiration)).toBeGreaterThan(remaining)
        expect(res.setCookie).toHaveBeenCalledWith(
          configuration.auth.token[type].name,
          expect.any(String),
          expect.objectContaining({ maxAge: remaining })
        )
      }
      // the signed tokens (access, refresh, ws) carry the same capped lifetime
      for (const call of jwtService.signAsync.mock.calls) {
        expect(call[1].expiresIn).toBe(remaining)
      }
    })

    it('keeps the configured lifetimes when the link expiration is later than them', async () => {
      vi.useFakeTimers()
      const expiresAt = new Date((currentTimeStamp() + 10 * 24 * 3600) * 1000)
      const res = { setCookie: vi.fn() }

      await authManager.setCookies(linkUser() as any, res as any, false, undefined, expiresAt)

      for (const type of [TOKEN_TYPE.REFRESH, TOKEN_TYPE.ACCESS, TOKEN_TYPE.WS, TOKEN_TYPE.CSRF]) {
        expect(res.setCookie).toHaveBeenCalledWith(
          configuration.auth.token[type].name,
          expect.any(String),
          expect.objectContaining({ maxAge: convertHumanTimeToSeconds(configuration.auth.token[type].expiration) })
        )
      }
    })

    it('keeps the configured lifetimes when the link has no expiration', async () => {
      const res = { setCookie: vi.fn() }

      await authManager.setCookies(linkUser() as any, res as any, false, undefined, null)

      expect(res.setCookie).toHaveBeenCalledWith(
        configuration.auth.token[TOKEN_TYPE.ACCESS].name,
        expect.any(String),
        expect.objectContaining({ maxAge: convertHumanTimeToSeconds(configuration.auth.token[TOKEN_TYPE.ACCESS].expiration) })
      )
    })

    it('expires the session at the exact instant the link expiration check would reject the link', async () => {
      vi.useFakeTimers()
      const expiresAt = new Date((currentTimeStamp() + 60) * 1000)
      const res = { setCookie: vi.fn() }

      const response = await authManager.setCookies(linkUser() as any, res as any, false, undefined, expiresAt)

      // checkLink rejects once `new Date() >= expiresAt`, so the access token must expire at that same instant
      expect(response.token[`${TOKEN_TYPE.ACCESS}_expiration`]).toBe(currentTimeStamp(expiresAt))
    })

    it('never issues a token without expiration for an almost-expired link', async () => {
      vi.useFakeTimers()
      // boundary already reached: the remaining lifetime must be clamped to a positive value, not 0 or undefined
      const expiresAt = new Date(currentTimeStamp() * 1000)
      const res = { setCookie: vi.fn() }

      await authManager.setCookies(linkUser() as any, res as any, false, undefined, expiresAt)

      for (const type of [TOKEN_TYPE.REFRESH, TOKEN_TYPE.ACCESS, TOKEN_TYPE.WS, TOKEN_TYPE.CSRF]) {
        expect(res.setCookie).toHaveBeenCalledWith(configuration.auth.token[type].name, expect.any(String), expect.objectContaining({ maxAge: 1 }))
      }
      for (const call of jwtService.signAsync.mock.calls) {
        expect(call[1].expiresIn).toBe(1)
      }
    })
  })

  describe('access and CSRF bounded by the remaining session on refresh', () => {
    const refreshingUser = (exp: number) => new UserModel({ id: 1, login: 'alice', language: 'en', role: USER_ROLE.USER, exp } as any)

    it('caps the access and CSRF cookies to the remaining refresh lifetime when refreshing near expiration', async () => {
      vi.useFakeTimers()
      const remaining = 30
      const res = { setCookie: vi.fn() }

      await authManager.refreshCookies(refreshingUser(currentTimeStamp() + remaining) as any, res as any)

      expect(convertHumanTimeToSeconds(configuration.auth.token[TOKEN_TYPE.ACCESS].expiration)).toBeGreaterThan(remaining)
      expect(res.setCookie).toHaveBeenCalledWith(
        configuration.auth.token[TOKEN_TYPE.ACCESS].name,
        expect.any(String),
        expect.objectContaining({ maxAge: remaining })
      )
      expect(res.setCookie).toHaveBeenCalledWith(
        configuration.auth.token[TOKEN_TYPE.CSRF].name,
        expect.any(String),
        expect.objectContaining({ maxAge: remaining })
      )
    })

    it('keeps the configured access lifetime when refreshing far from expiration', async () => {
      vi.useFakeTimers()
      const remaining = 3600
      const res = { setCookie: vi.fn() }

      await authManager.refreshCookies(refreshingUser(currentTimeStamp() + remaining) as any, res as any)

      const accessExpiration = convertHumanTimeToSeconds(configuration.auth.token[TOKEN_TYPE.ACCESS].expiration)
      expect(accessExpiration).toBeLessThan(remaining)
      expect(res.setCookie).toHaveBeenCalledWith(
        configuration.auth.token[TOKEN_TYPE.ACCESS].name,
        expect.any(String),
        expect.objectContaining({ maxAge: accessExpiration })
      )
      // the CSRF cookie stays alive for the whole session (the remaining refresh lifetime)
      expect(res.setCookie).toHaveBeenCalledWith(
        configuration.auth.token[TOKEN_TYPE.CSRF].name,
        expect.any(String),
        expect.objectContaining({ maxAge: remaining })
      )
    })

    it('caps the access token to the remaining refresh lifetime on token refresh', async () => {
      vi.useFakeTimers()
      const remaining = 30
      const exp = currentTimeStamp() + remaining

      const tokens = await authManager.getTokens(refreshingUser(exp) as any, true)

      expect(convertHumanTimeToSeconds(configuration.auth.token.access.expiration)).toBeGreaterThan(remaining)
      expect(tokens[`${TOKEN_TYPE.ACCESS}_expiration`]).toBe(exp)
    })

    it('keeps the configured access lifetime on a non-refresh token request', async () => {
      vi.useFakeTimers()
      const now = currentTimeStamp()

      const tokens = await authManager.getTokens(refreshingUser(now + 3600) as any)

      expect(tokens[`${TOKEN_TYPE.ACCESS}_expiration`]).toBe(now + convertHumanTimeToSeconds(configuration.auth.token.access.expiration))
    })
  })
})
