import { sign } from '@fastify/cookie'
import { createMock, DeepMocked } from '@golevelup/ts-jest'
import { ExecutionContext } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { Test, TestingModule } from '@nestjs/testing'
import { PinoLogger } from 'nestjs-pino'
import crypto from 'node:crypto'
import { UsersManager } from '../../applications/users/services/users-manager.service'
import { exportConfiguration } from '../../configuration/config.environment'
import { AuthConfig } from '../auth.config'
import { AuthManager } from '../auth.service'
import { CSRF_ERROR } from '../constants/auth'
import { JwtPayload } from '../interfaces/jwt-payload.interface'
import { TOKEN_TYPE } from '../interfaces/token.interface'
import { AuthTokenRefreshGuard } from './auth-token-refresh.guard'
import { AuthTokenRefreshStrategy } from './auth-token-refresh.strategy'

describe(AuthTokenRefreshGuard.name, () => {
  const csrfToken: string = crypto.randomUUID()
  let authConfig: AuthConfig
  let jwtService: JwtService
  let authRefreshGuard: AuthTokenRefreshGuard
  let refreshToken: string
  let refreshTokenWithoutCSRF: string
  let context: DeepMocked<ExecutionContext>

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [await ConfigModule.forRoot({ load: [exportConfiguration], isGlobal: true }), JwtModule.register({ global: true }), PassportModule],
      providers: [
        AuthTokenRefreshGuard,
        AuthTokenRefreshStrategy,
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
    authRefreshGuard = module.get<AuthTokenRefreshGuard>(AuthTokenRefreshGuard)
    refreshToken = await jwtService.signAsync({ identity: { id: 1, login: 'foo' }, [TOKEN_TYPE.CSRF]: csrfToken } as JwtPayload, {
      secret: authConfig.token.refresh.secret,
      expiresIn: 30
    })
    refreshTokenWithoutCSRF = await jwtService.signAsync({ identity: { id: 1, login: 'foo' } } as JwtPayload, {
      secret: authConfig.token.refresh.secret,
      expiresIn: 30
    })
    context = createMock<ExecutionContext>()
  })

  it('should be defined', () => {
    expect(authConfig).toBeDefined()
    expect(jwtService).toBeDefined()
    expect(authRefreshGuard).toBeDefined()
    expect(refreshToken).toBeDefined()
    expect(refreshTokenWithoutCSRF).toBeDefined()
    expect(csrfToken).toBeDefined()
  })

  it('should pass with a valid refresh token in cookies with CSRF', async () => {
    context.switchToHttp().getRequest.mockReturnValue({
      raw: { user: '' },
      headers: { [authConfig.token.csrf.name]: sign(csrfToken, authConfig.token.csrf.secret) },
      cookies: {
        [authConfig.token.refresh.name]: refreshToken
      }
    })
    expect(await authRefreshGuard.canActivate(context)).toBe(true)
  })

  it('should pass with a valid refresh token in request header with no CSRF', async () => {
    context.switchToHttp().getRequest.mockReturnValue({
      raw: { user: '' },
      headers: {
        authorization: `Bearer ${refreshToken}`
      }
    })
    expect(await authRefreshGuard.canActivate(context)).toBe(true)
  })

  it('should throw an error with an invalid refresh token in cookies', async () => {
    context.switchToHttp().getRequest.mockReturnValue({
      raw: { user: '' },
      headers: {},
      cookies: {
        [authConfig.token.refresh.name]: 'bar'
      }
    })
    await expect(authRefreshGuard.canActivate(context)).rejects.toThrow('Unauthorized')
  })

  it('should throw an error with an invalid refresh token in request header', async () => {
    context.switchToHttp().getRequest.mockReturnValue({
      raw: { user: '' },
      headers: {
        authorization: `Bearer bar`
      }
    })
    await expect(authRefreshGuard.canActivate(context)).rejects.toThrow('Unauthorized')
  })

  it('should throw an error with a valid refresh token in cookies and a missing CSRF in request header', async () => {
    context.switchToHttp().getRequest.mockReturnValue({
      raw: { user: '' },
      headers: {},
      cookies: {
        [authConfig.token.refresh.name]: refreshToken
      }
    })
    await expect(authRefreshGuard.canActivate(context)).rejects.toThrow(new RegExp(CSRF_ERROR.MISSING_HEADERS))
  })

  it('should throw an error with a valid refresh token in cookies and a missing CSRF claim in the refresh token', async () => {
    context.switchToHttp().getRequest.mockReturnValue({
      raw: { user: '' },
      headers: { [authConfig.token.csrf.name]: csrfToken },
      cookies: {
        [authConfig.token.refresh.name]: refreshTokenWithoutCSRF
      }
    })
    await expect(authRefreshGuard.canActivate(context)).rejects.toThrow(new RegExp(CSRF_ERROR.MISSING_JWT))
  })

  it('should throw an error with a valid refresh token in cookies and a mismatch CSRF', async () => {
    context.switchToHttp().getRequest.mockReturnValue({
      raw: { user: '' },
      headers: { [authConfig.token.csrf.name]: csrfToken + '*' },
      cookies: {
        [authConfig.token.refresh.name]: refreshToken
      }
    })
    await expect(authRefreshGuard.canActivate(context)).rejects.toThrow(new RegExp(CSRF_ERROR.MISMATCH))
  })
})
