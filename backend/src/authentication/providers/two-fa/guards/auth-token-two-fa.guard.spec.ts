import { sign } from '@fastify/cookie'
import { createMock, DeepMocked } from '@golevelup/ts-vitest'
import { ExecutionContext } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { Test, TestingModule } from '@nestjs/testing'
import { PinoLogger } from 'nestjs-pino'
import crypto from 'node:crypto'
import { exportConfiguration } from '../../../../configuration/config.environment'
import { AuthConfig } from '../../../auth.config'
import { AuthManager } from '../../../auth.service'
import { CSRF_ERROR } from '../../../constants/auth'
import { JwtPayload } from '../../../interfaces/jwt-payload.interface'
import { TOKEN_TYPE } from '../../../interfaces/token.interface'
import { AuthTokenTwoFaGuard } from './auth-token-two-fa.guard'
import { AuthTokenTwoFaStrategy } from './auth-token-two-fa.strategy'

describe(AuthTokenTwoFaGuard.name, () => {
  const csrfToken = crypto.randomUUID()
  let authConfig: AuthConfig
  let authTokenTwoFaGuard: AuthTokenTwoFaGuard
  let context: DeepMocked<ExecutionContext>
  let temporaryTwoFaToken: string
  let accessToken: string

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [await ConfigModule.forRoot({ load: [exportConfiguration], isGlobal: true }), JwtModule.register({ global: true }), PassportModule],
      providers: [
        AuthTokenTwoFaGuard,
        AuthTokenTwoFaStrategy,
        AuthManager,
        {
          provide: PinoLogger,
          useValue: {
            assign: () => undefined
          }
        }
      ]
    }).compile()

    authConfig = module.get<ConfigService>(ConfigService).get<AuthConfig>('auth')
    const jwtService = module.get<JwtService>(JwtService)
    authTokenTwoFaGuard = module.get<AuthTokenTwoFaGuard>(AuthTokenTwoFaGuard)
    temporaryTwoFaToken = await jwtService.signAsync(
      { tokenType: TOKEN_TYPE.ACCESS_2FA, identity: { id: 1, login: 'foo', twoFaEnabled: true }, csrf: csrfToken } as JwtPayload,
      {
        secret: authConfig.token[TOKEN_TYPE.ACCESS_2FA].secret,
        expiresIn: 30
      }
    )
    accessToken = await jwtService.signAsync({ tokenType: TOKEN_TYPE.ACCESS, identity: { id: 1, login: 'foo' }, csrf: csrfToken } as JwtPayload, {
      secret: authConfig.token[TOKEN_TYPE.ACCESS_2FA].secret,
      expiresIn: 30
    })
    context = createMock<ExecutionContext>()
  })

  it('should accept a temporary 2FA token from its cookie with CSRF', async () => {
    context.switchToHttp().getRequest.mockReturnValue({
      raw: { user: '' },
      headers: { [authConfig.token.csrf.name]: sign(csrfToken, authConfig.token.csrf.secret) },
      cookies: {
        [authConfig.token[TOKEN_TYPE.ACCESS_2FA].name]: temporaryTwoFaToken
      }
    })

    await expect(authTokenTwoFaGuard.canActivate(context)).resolves.toBe(true)
  })

  it('should reject a normal access token', async () => {
    context.switchToHttp().getRequest.mockReturnValue({
      raw: { user: '' },
      headers: { [authConfig.token.csrf.name]: sign(csrfToken, authConfig.token.csrf.secret) },
      cookies: {
        [authConfig.token[TOKEN_TYPE.ACCESS_2FA].name]: accessToken
      }
    })

    await expect(authTokenTwoFaGuard.canActivate(context)).rejects.toThrow('Unauthorized')
  })

  it('should reject a temporary 2FA token without CSRF', async () => {
    context.switchToHttp().getRequest.mockReturnValue({
      raw: { user: '' },
      headers: {},
      cookies: {
        [authConfig.token[TOKEN_TYPE.ACCESS_2FA].name]: temporaryTwoFaToken
      }
    })

    await expect(authTokenTwoFaGuard.canActivate(context)).rejects.toThrow(new RegExp(CSRF_ERROR.MISSING_HEADERS))
  })

  it('should not accept a temporary 2FA token as a bearer token', async () => {
    context.switchToHttp().getRequest.mockReturnValue({
      raw: { user: '' },
      headers: {
        authorization: `Bearer ${temporaryTwoFaToken}`
      }
    })

    await expect(authTokenTwoFaGuard.canActivate(context)).rejects.toThrow('Unauthorized')
  })
})
