import { createMock, DeepMocked } from '@golevelup/ts-vitest'
import { ExecutionContext } from '@nestjs/common'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { Test, TestingModule } from '@nestjs/testing'
import { PinoLogger } from 'nestjs-pino'
import { JwtPayload } from '../../../../authentication/interfaces/jwt-payload.interface'
import { TOKEN_TYPE } from '../../../../authentication/interfaces/token.interface'
import { configuration } from '../../../../configuration/config.environment'
import { ONLY_OFFICE_TOKEN_QUERY_PARAM_NAME } from './only-office.constants'
import { OnlyOfficeGuard } from './only-office.guard'
import { API_ONLY_OFFICE_CALLBACK } from './only-office.routes'
import { OnlyOfficeStrategy } from './only-office.strategy'

describe(OnlyOfficeGuard.name, () => {
  let jwtService: JwtService
  let filesOnlyOfficeGuard: OnlyOfficeGuard
  let context: DeepMocked<ExecutionContext>
  let onlyOfficeToken: string
  let temporaryTwoFaToken: string

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ global: true })],
      providers: [
        OnlyOfficeGuard,
        OnlyOfficeStrategy,
        {
          provide: PinoLogger,
          useValue: {
            assign: () => undefined
          }
        }
      ]
    }).compile()

    jwtService = module.get<JwtService>(JwtService)
    filesOnlyOfficeGuard = module.get<OnlyOfficeGuard>(OnlyOfficeGuard)
    context = createMock<ExecutionContext>()
    onlyOfficeToken = await jwtService.signAsync({ tokenType: TOKEN_TYPE.ONLY_OFFICE, identity: { id: 1, login: 'foo' } } as JwtPayload, {
      secret: configuration.auth.token.access.secret,
      expiresIn: 30
    })
    temporaryTwoFaToken = await jwtService.signAsync(
      { tokenType: TOKEN_TYPE.ACCESS_2FA, identity: { id: 1, login: 'foo', twoFaEnabled: true } } as JwtPayload,
      {
        secret: configuration.auth.token.access.secret,
        expiresIn: 30
      }
    )
  })

  it('should be defined', () => {
    expect(jwtService).toBeDefined()
    expect(filesOnlyOfficeGuard).toBeDefined()
    expect(onlyOfficeToken).toBeDefined()
    expect(temporaryTwoFaToken).toBeDefined()
  })

  it('should not pass without a valid token', async () => {
    context.switchToHttp().getRequest.mockReturnValue({
      url: `${API_ONLY_OFFICE_CALLBACK}`,
      raw: { user: '' }
    })
    await expect(filesOnlyOfficeGuard.canActivate(context)).rejects.toThrow('Unauthorized')
  })

  it('should pass with a valid OnlyOffice token and reject an invalid token', async () => {
    context.switchToHttp().getRequest.mockReturnValue({
      url: `${API_ONLY_OFFICE_CALLBACK}?${ONLY_OFFICE_TOKEN_QUERY_PARAM_NAME}=${onlyOfficeToken}`,
      cookies: {
        [configuration.auth.token.access.name]: temporaryTwoFaToken
      },
      raw: { user: '' }
    })
    expect(await filesOnlyOfficeGuard.canActivate(context)).toBe(true)
    context.switchToHttp().getRequest.mockReturnValue({
      url: `${API_ONLY_OFFICE_CALLBACK}?${ONLY_OFFICE_TOKEN_QUERY_PARAM_NAME}=unvalidToken`,
      raw: { user: '' }
    })
    await expect(filesOnlyOfficeGuard.canActivate(context)).rejects.toThrow('Unauthorized')
  })

  it('should reject a temporary 2FA token', async () => {
    context.switchToHttp().getRequest.mockReturnValue({
      url: `${API_ONLY_OFFICE_CALLBACK}?${ONLY_OFFICE_TOKEN_QUERY_PARAM_NAME}=${temporaryTwoFaToken}`,
      raw: { user: '' }
    })

    await expect(filesOnlyOfficeGuard.canActivate(context)).rejects.toThrow('Unauthorized')
  })
})
