import { createMock, DeepMocked } from '@golevelup/ts-vitest'
import { ExecutionContext } from '@nestjs/common'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { Test, TestingModule } from '@nestjs/testing'
import { PinoLogger } from 'nestjs-pino'
import { TOKEN_TYPE } from '../../../../authentication/interfaces/token.interface'
import { configuration } from '../../../../configuration/config.environment'
import { COLLABORA_TOKEN_QUERY_PARAM_NAME } from './collabora-online.constants'
import { CollaboraOnlineGuard } from './collabora-online.guard'
import { API_COLLABORA_ONLINE_FILES } from './collabora-online.routes'
import { CollaboraOnlineStrategy } from './collabora-online.strategy'

describe(CollaboraOnlineGuard.name, () => {
  let jwtService: JwtService
  let filesCollaboraGuard: CollaboraOnlineGuard
  let context: DeepMocked<ExecutionContext>
  let collaboraToken: string
  let temporaryTwoFaToken: string

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ global: true })],
      providers: [
        CollaboraOnlineGuard,
        CollaboraOnlineStrategy,
        {
          provide: PinoLogger,
          useValue: {
            assign: () => undefined
          }
        }
      ]
    }).compile()

    jwtService = module.get<JwtService>(JwtService)
    filesCollaboraGuard = module.get<CollaboraOnlineGuard>(CollaboraOnlineGuard)
    context = createMock<ExecutionContext>()
    collaboraToken = await jwtService.signAsync(
      { tokenType: TOKEN_TYPE.COLLABORA_ONLINE, identity: { id: 1, login: 'foo' } },
      {
        secret: configuration.auth.token.access.secret,
        expiresIn: 30
      }
    )
    temporaryTwoFaToken = await jwtService.signAsync(
      { tokenType: TOKEN_TYPE.ACCESS_2FA, identity: { id: 1, login: 'foo', twoFaEnabled: true } },
      {
        secret: configuration.auth.token.access.secret,
        expiresIn: 30
      }
    )
  })

  it('should be defined', () => {
    expect(jwtService).toBeDefined()
    expect(filesCollaboraGuard).toBeDefined()
    expect(collaboraToken).toBeDefined()
    expect(temporaryTwoFaToken).toBeDefined()
  })

  it('should not pass without a valid token', async () => {
    context.switchToHttp().getRequest.mockReturnValue({
      url: `${API_COLLABORA_ONLINE_FILES}`,
      raw: { user: '' }
    })
    await expect(filesCollaboraGuard.canActivate(context)).rejects.toThrow('Unauthorized')
  })

  it('should pass with a valid Collabora token and reject an invalid token', async () => {
    context.switchToHttp().getRequest.mockReturnValue({
      url: `${API_COLLABORA_ONLINE_FILES}?${COLLABORA_TOKEN_QUERY_PARAM_NAME}=${collaboraToken}`,
      cookies: {
        [configuration.auth.token.access.name]: temporaryTwoFaToken
      },
      raw: { user: '' }
    })
    expect(await filesCollaboraGuard.canActivate(context)).toBe(true)
    context.switchToHttp().getRequest.mockReturnValue({
      url: `${API_COLLABORA_ONLINE_FILES}?${COLLABORA_TOKEN_QUERY_PARAM_NAME}=unvalidToken`,
      raw: { user: '' }
    })
    await expect(filesCollaboraGuard.canActivate(context)).rejects.toThrow('Unauthorized')
  })

  it('should reject a temporary 2FA token', async () => {
    context.switchToHttp().getRequest.mockReturnValue({
      url: `${API_COLLABORA_ONLINE_FILES}?${COLLABORA_TOKEN_QUERY_PARAM_NAME}=${temporaryTwoFaToken}`,
      raw: { user: '' }
    })

    await expect(filesCollaboraGuard.canActivate(context)).rejects.toThrow('Unauthorized')
  })
})
