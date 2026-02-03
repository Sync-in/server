import { createMock, DeepMocked } from '@golevelup/ts-jest'
import { ExecutionContext } from '@nestjs/common'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { Test, TestingModule } from '@nestjs/testing'
import { PinoLogger } from 'nestjs-pino'
import { JwtPayload } from '../../../../authentication/interfaces/jwt-payload.interface'
import { configuration } from '../../../../configuration/config.environment'
import { COLLABORA_TOKEN_QUERY_PARAM_NAME } from './collabora-online.constants'
import { CollaboraOnlineGuard } from './collabora-online.guard'
import { API_COLLABORA_ONLINE_FILES } from './collabora-online.routes'
import { CollaboraOnlineStrategy } from './collabora-online.strategy'

describe(CollaboraOnlineGuard.name, () => {
  let jwtService: JwtService
  let filesCollaboraGuard: CollaboraOnlineGuard
  let context: DeepMocked<ExecutionContext>
  let accessToken: string

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
    accessToken = await jwtService.signAsync({ identity: { id: 1, login: 'foo' } } as JwtPayload, {
      secret: configuration.auth.token.access.secret,
      expiresIn: 30
    })
  })

  it('should be defined', () => {
    expect(jwtService).toBeDefined()
    expect(filesCollaboraGuard).toBeDefined()
    expect(accessToken).toBeDefined()
  })

  it('should not pass without a valid token', async () => {
    context.switchToHttp().getRequest.mockReturnValue({
      url: `${API_COLLABORA_ONLINE_FILES}`,
      raw: { user: '' }
    })
    await expect(filesCollaboraGuard.canActivate(context)).rejects.toThrow('Unauthorized')
  })

  it('should pass with a (un)valid token', async () => {
    context.switchToHttp().getRequest.mockReturnValue({
      url: `${API_COLLABORA_ONLINE_FILES}?${COLLABORA_TOKEN_QUERY_PARAM_NAME}=${accessToken}`,
      raw: { user: '' }
    })
    expect(await filesCollaboraGuard.canActivate(context)).toBe(true)
    context.switchToHttp().getRequest.mockReturnValue({
      url: `${API_COLLABORA_ONLINE_FILES}?${COLLABORA_TOKEN_QUERY_PARAM_NAME}=unvalidToken`,
      raw: { user: '' }
    })
    await expect(filesCollaboraGuard.canActivate(context)).rejects.toThrow('Unauthorized')
  })
})
