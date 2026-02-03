import { sign } from '@fastify/cookie'
import { createMock, DeepMocked } from '@golevelup/ts-jest'
import { ExecutionContext } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { Reflector } from '@nestjs/core'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { Test, TestingModule } from '@nestjs/testing'
import { PinoLogger } from 'nestjs-pino'
import crypto from 'node:crypto'
import { UsersManager } from '../../applications/users/services/users-manager.service'
import { WEB_DAV_CONTEXT, WebDAVContext } from '../../applications/webdav/decorators/webdav-context.decorator'
import { exportConfiguration } from '../../configuration/config.environment'
import { AuthConfig } from '../auth.config'
import { AuthManager } from '../auth.service'
import { CSRF_ERROR } from '../constants/auth'
import { AuthTokenOptional } from '../decorators/auth-token-optional.decorator'
import { AUTH_TOKEN_SKIP, AuthTokenSkip } from '../decorators/auth-token-skip.decorator'
import { JwtPayload } from '../interfaces/jwt-payload.interface'
import { TOKEN_TYPE } from '../interfaces/token.interface'
import { AuthAnonymousGuard } from './auth-anonymous.guard'
import { AuthAnonymousStrategy } from './auth-anonymous.strategy'
import { AuthTokenAccessGuard } from './auth-token-access.guard'
import { AuthTokenAccessStrategy } from './auth-token-access.strategy'

describe(AuthTokenAccessGuard.name, () => {
  const csrfToken: string = crypto.randomUUID()
  let authConfig: AuthConfig
  let jwtService: JwtService
  let authAccessGuard: AuthTokenAccessGuard
  let authAnonymousGuard: AuthAnonymousGuard
  let authAnonymousStrategy: AuthAnonymousStrategy
  let reflector: Reflector
  let accessTokenWithoutCSRF: string
  let accessToken: string
  let context: DeepMocked<ExecutionContext>

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        await ConfigModule.forRoot({
          load: [exportConfiguration],
          isGlobal: true
        }),
        JwtModule.register({ global: true }),
        PassportModule
      ],
      providers: [
        AuthTokenAccessStrategy,
        AuthAnonymousStrategy,
        AuthAnonymousGuard,
        AuthManager,
        { provide: UsersManager, useValue: {} },
        {
          provide: PinoLogger,
          useValue: {
            assign: () => undefined
          }
        }
      ]
    }).compile()

    authConfig = module.get<ConfigService>(ConfigService).get<AuthConfig>('auth')
    jwtService = module.get<JwtService>(JwtService)
    reflector = new Reflector()
    authAccessGuard = new AuthTokenAccessGuard(reflector)
    authAnonymousStrategy = module.get<AuthAnonymousStrategy>(AuthAnonymousStrategy)
    authAnonymousGuard = module.get<AuthAnonymousGuard>(AuthAnonymousGuard)
    accessToken = await jwtService.signAsync({ identity: { id: 1, login: 'foo' }, [TOKEN_TYPE.CSRF]: csrfToken } as JwtPayload, {
      secret: authConfig.token.access.secret,
      expiresIn: 30
    })
    accessTokenWithoutCSRF = await jwtService.signAsync({ identity: { id: 1, login: 'foo' } } as JwtPayload, {
      secret: authConfig.token.access.secret,
      expiresIn: 30
    })
    context = createMock<ExecutionContext>()
  })

  it('should be defined', () => {
    expect(authConfig).toBeDefined()
    expect(jwtService).toBeDefined()
    expect(authAccessGuard).toBeDefined()
    expect(authAnonymousGuard).toBeDefined()
    expect(authAnonymousStrategy).toBeDefined()
    expect(accessToken).toBeDefined()
    expect(accessTokenWithoutCSRF).toBeDefined()
    expect(csrfToken).toBeDefined()
  })

  it('should pass with a valid access token in cookies with CSRF', async () => {
    context.switchToHttp().getRequest.mockReturnValue({
      raw: { user: '' },
      headers: { [authConfig.token.csrf.name]: sign(csrfToken, authConfig.token.csrf.secret) },
      cookies: {
        [authConfig.token.access.name]: accessToken
      }
    })
    expect(await authAccessGuard.canActivate(context)).toBe(true)
  })

  it('should pass with a valid access token in request header with no CSRF', async () => {
    context.switchToHttp().getRequest.mockReturnValue({
      raw: { user: '' },
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    })
    expect(await authAccessGuard.canActivate(context)).toBe(true)
  })

  it('should throw an error with an invalid access token in cookies', async () => {
    // Cookies test
    context.switchToHttp().getRequest.mockReturnValue({
      raw: { user: '' },
      headers: {},
      cookies: {
        [authConfig.token.access.name]: 'bar'
      }
    })
    await expect(authAccessGuard.canActivate(context)).rejects.toThrow('Unauthorized')
  })

  it('should throw an error with an invalid access token in request header', async () => {
    context.switchToHttp().getRequest.mockReturnValue({
      raw: { user: '' },
      headers: {
        authorization: `Bearer bar`
      }
    })
    await expect(authAccessGuard.canActivate(context)).rejects.toThrow('Unauthorized')
  })

  it('should throw an error with a valid access token in cookies and a missing CSRF in request header', async () => {
    context.switchToHttp().getRequest.mockReturnValue({
      raw: { user: '' },
      headers: {},
      cookies: {
        [authConfig.token.access.name]: accessToken
      }
    })
    await expect(authAccessGuard.canActivate(context)).rejects.toThrow(new RegExp(CSRF_ERROR.MISSING_HEADERS))
  })

  it('should throw an error with a valid access token in cookies and a missing CSRF claim in the access token', async () => {
    context.switchToHttp().getRequest.mockReturnValue({
      raw: { user: '' },
      headers: { [authConfig.token.csrf.name]: csrfToken },
      cookies: {
        [authConfig.token.access.name]: accessTokenWithoutCSRF
      }
    })
    await expect(authAccessGuard.canActivate(context)).rejects.toThrow(new RegExp(CSRF_ERROR.MISSING_JWT))
  })

  it('should throw an error with a valid access token in cookies and a mismatch CSRF', async () => {
    context.switchToHttp().getRequest.mockReturnValue({
      raw: { user: '' },
      headers: { [authConfig.token.csrf.name]: csrfToken + '*' },
      cookies: {
        [authConfig.token.access.name]: accessToken
      }
    })
    await expect(authAccessGuard.canActivate(context)).rejects.toThrow(new RegExp(CSRF_ERROR.MISMATCH))
  })

  it('should pass with method GET and a valid access token in cookies and a mismatch CSRF', async () => {
    context.switchToHttp().getRequest.mockReturnValue({
      method: 'GET',
      raw: { user: '' },
      headers: { [authConfig.token.csrf.name]: csrfToken + '*' },
      cookies: {
        [authConfig.token.access.name]: accessToken
      }
    })
    await expect(authAccessGuard.canActivate(context)).resolves.not.toThrow()
  })

  it('should throw an error with method POST and a valid access token in cookies and a mismatch CSRF', async () => {
    context.switchToHttp().getRequest.mockReturnValue({
      method: 'POST',
      raw: { user: '' },
      headers: { [authConfig.token.csrf.name]: csrfToken + '*' },
      cookies: {
        [authConfig.token.access.name]: accessToken
      }
    })
    await expect(authAccessGuard.canActivate(context)).rejects.toThrow(new RegExp(CSRF_ERROR.MISMATCH))
  })

  it('should bypass access token when AuthTokenSkip decorator is applied to context', () => {
    context = createMock<ExecutionContext>()
    AuthTokenSkip()(context.getHandler())
    expect(reflector.getAllAndOverride<boolean>(AUTH_TOKEN_SKIP, [context.getHandler(), context.getClass()])).toBe(true)
    context.switchToHttp().getRequest.mockReturnValue({
      raw: { user: '' },
      headers: {
        authorization: `Bearer bar`
      }
    })
    expect(authAccessGuard.canActivate(context)).toBe(true)
  })

  it('should bypass access token with WebDAVContext decorator is applied to context', () => {
    context = createMock<ExecutionContext>()
    WebDAVContext()(context.getHandler())
    expect(reflector.getAllAndOverride<boolean>(AUTH_TOKEN_SKIP, [context.getHandler(), context.getClass()])).toBe(undefined)
    expect(reflector.getAllAndOverride<boolean>(WEB_DAV_CONTEXT, [context.getHandler(), context.getClass()])).toBe(true)
    context.switchToHttp().getRequest.mockReturnValue({
      raw: { user: '' },
      headers: {
        authorization: `Bearer bar`
      }
    })
    expect(authAccessGuard.canActivate(context)).toBe(true)
  })

  it('should pass without a valid access token when AuthTokenOptional is applied to context', async () => {
    const spyAuthenticate = jest.spyOn(authAnonymousStrategy, 'authenticate')
    context = createMock<ExecutionContext>()
    AuthTokenOptional()(context.getHandler())
    expect(reflector.getAllAndOverride<boolean>(AUTH_TOKEN_SKIP, [context.getHandler(), context.getClass()])).toBe(true)
    context.switchToHttp().getRequest.mockReturnValue({
      raw: { user: '' },
      authorization: `Bearer bar`
    })
    expect(authAccessGuard.canActivate(context)).toBe(true)
    expect(await authAnonymousGuard.canActivate(context)).toBe(true)
    expect(spyAuthenticate).toHaveBeenCalledTimes(1)
    spyAuthenticate.mockClear()
  })
})
