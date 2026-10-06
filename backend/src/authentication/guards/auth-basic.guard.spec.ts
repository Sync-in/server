import { createMock, DeepMocked } from '@golevelup/ts-vitest'
import { ExecutionContext } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import type { FastifyRequest } from 'fastify'
import { PinoLogger } from 'nestjs-pino'
import { UserModel } from '../../applications/users/models/user.model.js'
import { generateUserTest } from '../../applications/users/utils/test.js'
import { WEBDAV_BASE_PATH } from '../../applications/webdav/constants/routes.js'
import { Cache } from '../../infrastructure/cache/cache.service.js'
import { AUTH_RATE_LIMIT_ERROR_MESSAGE } from '../constants/auth.js'
import { AuthPasswordWorkLimitException } from '../errors/auth-password-work-limit.exception.js'
import { AuthProvider } from '../providers/auth-providers.models.js'
import { AuthBasicGuard } from './auth-basic.guard.js'
import { AuthBasicStrategy } from './auth-basic.strategy.js'

describe(AuthBasicGuard.name, () => {
  let authBasicGuard: AuthBasicGuard
  let authBasicStrategy: AuthBasicStrategy
  let authProvider: AuthProvider
  let cache: Cache
  let userTest: UserModel
  let encodedAuth: string
  let context: DeepMocked<ExecutionContext>
  const requestIp = '127.0.0.1'

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthBasicGuard,
        AuthBasicStrategy,
        {
          provide: AuthProvider,
          useValue: {
            validateUser: async () => null
          }
        },
        {
          provide: PinoLogger,
          useValue: {
            assign: () => undefined,
            error: vi.fn()
          }
        },
        {
          provide: Cache,
          useValue: {
            get: (_key: string) => undefined,
            set: async (_key: string, _value: string, _ttl: number) => undefined,
            consumeRateLimit: vi.fn().mockResolvedValue({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 }),
            genSlugKey: () => 'test'
          }
        }
      ]
    }).compile()

    authBasicGuard = module.get<AuthBasicGuard>(AuthBasicGuard)
    authBasicStrategy = module.get<AuthBasicStrategy>(AuthBasicStrategy)
    authProvider = module.get<AuthProvider>(AuthProvider)
    cache = module.get<Cache>(Cache)
    userTest = new UserModel(generateUserTest(), false)
    encodedAuth = Buffer.from(`${userTest.login}:${userTest.password}`).toString('base64')
    context = createMock<ExecutionContext>()
  })

  it('should be defined', () => {
    expect(authBasicGuard).toBeDefined()
    expect(authBasicStrategy).toBeDefined()
    expect(authProvider).toBeDefined()
    expect(cache).toBeDefined()
    expect(encodedAuth).toBeDefined()
    expect(userTest).toBeDefined()
    expect(userTest.password).toBeDefined()
  })

  it('should validate the user authentication', async () => {
    authProvider.validateUser = vi.fn().mockReturnValueOnce(userTest)
    context.switchToHttp().getRequest.mockReturnValue({
      ip: requestIp,
      raw: { user: '' },
      headers: { authorization: `Basic ${encodedAuth}` }
    })
    expect(await authBasicGuard.canActivate(context)).toBe(true)
    expect(userTest.password).toBeUndefined()
  })

  it('should validate the user authentication with password containing colon', async () => {
    const passwordWithColon = 'pass:word:123'
    const userWithColonPassword = new UserModel({ ...generateUserTest(), password: passwordWithColon }, false)
    const encodedAuthWithColon = Buffer.from(`${userWithColonPassword.login}:${passwordWithColon}`).toString('base64')

    authProvider.validateUser = vi.fn().mockImplementation((login: string, password: string) => {
      expect(login).toBe(userWithColonPassword.login)
      expect(password).toBe(passwordWithColon)
      return userWithColonPassword
    })
    context.switchToHttp().getRequest.mockReturnValue({
      ip: requestIp,
      raw: { user: '' },
      headers: { authorization: `Basic ${encodedAuthWithColon}` }
    })
    expect(await authBasicGuard.canActivate(context)).toBe(true)
    expect(userWithColonPassword.password).toBeUndefined()
  })

  it('should reject an empty password before calling the authentication provider', async () => {
    const encodedAuthWithEmptyPassword = Buffer.from(`${userTest.login}:`).toString('base64')
    authProvider.validateUser = vi.fn()
    context.switchToHttp().getRequest.mockReturnValue({
      raw: { user: '' },
      headers: { authorization: `Basic ${encodedAuthWithEmptyPassword}` }
    })

    await expect(authBasicGuard.canActivate(context)).rejects.toThrow()
    expect(authProvider.validateUser).not.toHaveBeenCalled()
  })

  it('should validate cached credentials without consuming the rate limit', async () => {
    cache.get = vi.fn().mockReturnValueOnce(userTest)
    const rateLimitSpy = vi.mocked(cache.consumeRateLimit).mockClear()
    authProvider.validateUser = vi.fn()
    context.switchToHttp().getRequest.mockReturnValue({
      ip: requestIp,
      raw: { user: '' },
      headers: { authorization: `Basic ${encodedAuth}` }
    })
    expect(await authBasicGuard.canActivate(context)).toBe(true)
    expect(rateLimitSpy).not.toHaveBeenCalled()
    expect(authProvider.validateUser).not.toHaveBeenCalled()
  })

  it('should revalidate a legacy negative cache entry', async () => {
    cache.get = vi.fn().mockResolvedValueOnce(null)
    cache.consumeRateLimit = vi.fn().mockResolvedValue({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 })
    const user = new UserModel(generateUserTest(), false)
    authProvider.validateUser = vi.fn().mockResolvedValueOnce(user)

    expect(await authBasicStrategy.validate({ ip: requestIp } as FastifyRequest, user.login, 'app-password')).toBe(user)
    expect(cache.consumeRateLimit).toHaveBeenCalledOnce()
    expect(authProvider.validateUser).toHaveBeenCalledOnce()
  })

  it('should not cache a WebDAV denial and should revalidate after the account is unlocked', async () => {
    cache.get = vi.fn().mockResolvedValue(undefined)
    cache.consumeRateLimit = vi.fn().mockResolvedValue({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 })
    const setSpy = vi.spyOn(cache, 'set').mockClear()
    const user = new UserModel(generateUserTest(), false)
    authProvider.validateUser = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(user)
    const request = { ip: requestIp } as FastifyRequest

    expect(await authBasicStrategy.validate(request, user.login, 'app-password')).toBeNull()
    expect(setSpy).not.toHaveBeenCalled()
    expect(await authBasicStrategy.validate(request, user.login, 'app-password')).toBe(user)
    expect(cache.get).toHaveBeenCalledTimes(2)
    expect(authProvider.validateUser).toHaveBeenCalledTimes(2)
    expect(setSpy).toHaveBeenCalledOnce()
  })

  it('should log a failed cache write after successful authentication', async () => {
    cache.get = vi.fn().mockResolvedValueOnce(undefined)
    cache.consumeRateLimit = vi.fn().mockResolvedValue({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 })
    const user = new UserModel(generateUserTest(), false)
    authProvider.validateUser = vi.fn().mockResolvedValueOnce(user)
    vi.spyOn(cache, 'set').mockRejectedValueOnce(new Error('cache failed'))
    const loggerSpy = vi.spyOn(authBasicStrategy['logger'], 'error').mockImplementation(() => undefined)

    expect(await authBasicStrategy.validate({ ip: requestIp } as FastifyRequest, user.login, 'app-password')).toBe(user)
    await vi.waitFor(() =>
      expect(loggerSpy).toHaveBeenCalledWith(expect.objectContaining({ tag: 'validate', msg: expect.stringContaining('cache failed') }))
    )
  })

  it('should not validate the user authentication', async () => {
    cache.get = vi.fn().mockResolvedValueOnce(undefined)
    cache.consumeRateLimit = vi.fn().mockResolvedValue({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 })
    authProvider.validateUser = vi.fn().mockResolvedValueOnce(null)
    context.switchToHttp().getRequest.mockReturnValue({
      ip: requestIp,
      raw: { user: '' },
      headers: { authorization: `Basic ${encodedAuth}` }
    })
    await expect(authBasicGuard.canActivate(context)).rejects.toThrow()
  })

  it('should throw error due to malformed authorization header', async () => {
    // headers with capitals not working
    context.switchToHttp().getRequest.mockReturnValueOnce({
      raw: { user: '' },
      headers: { AUTHORIZATION: 'Basic foo' }
    })
    await expect(authBasicGuard.canActivate(context)).rejects.toThrow()
    context.switchToHttp().getRequest.mockReturnValueOnce({
      raw: { user: '' }
    })
    await expect(authBasicGuard.canActivate(context)).rejects.toThrow()
  })

  it(`should valid OPTIONS method without authentication header on "/" and "/${WEBDAV_BASE_PATH}/*" paths `, async () => {
    for (const url of ['', `/${WEBDAV_BASE_PATH}`, `/${WEBDAV_BASE_PATH}/foo/bar`]) {
      context.switchToHttp().getRequest.mockReturnValueOnce({
        method: 'OPTIONS',
        originalUrl: url,
        raw: { user: '' }
      })
      expect(await authBasicGuard.canActivate(context)).toBe(true)
    }
  })

  it('should not valid OPTIONS method with other paths', async () => {
    context.switchToHttp().getRequest.mockReturnValueOnce({
      method: 'OPTIONS',
      originalUrl: '/foo',
      raw: { user: '' }
    })
    await expect(authBasicGuard.canActivate(context)).rejects.toThrow()
  })

  it('should rate limit unknown credentials before calling the authentication provider', async () => {
    cache.get = vi.fn().mockResolvedValueOnce(undefined)
    cache.consumeRateLimit = vi.fn().mockResolvedValueOnce({ totalHits: 61, timeToExpire: 60, isBlocked: true, timeToBlockExpire: 60 })
    authProvider.validateUser = vi.fn()

    await expect(authBasicStrategy.validate({ ip: requestIp } as FastifyRequest, userTest.login, 'unknown-password')).rejects.toThrow(
      AUTH_RATE_LIMIT_ERROR_MESSAGE
    )
    expect(authProvider.validateUser).not.toHaveBeenCalled()
  })

  it('should not cache credentials denied by the shared password-work limit', async () => {
    cache.get = vi.fn().mockResolvedValueOnce(undefined)
    cache.consumeRateLimit = vi.fn().mockResolvedValueOnce({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 })
    const setSpy = vi.spyOn(cache, 'set').mockClear()
    authProvider.validateUser = vi.fn().mockRejectedValueOnce(new AuthPasswordWorkLimitException())

    await expect(authBasicStrategy.validate({ ip: requestIp } as FastifyRequest, userTest.login, 'possibly-valid-password')).resolves.toBeNull()
    expect(setSpy).not.toHaveBeenCalled()
  })
})
