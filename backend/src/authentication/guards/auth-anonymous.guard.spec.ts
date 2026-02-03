import { createMock, DeepMocked } from '@golevelup/ts-jest'
import { ExecutionContext } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { PassportModule } from '@nestjs/passport'
import { Test, TestingModule } from '@nestjs/testing'
import { PinoLogger } from 'nestjs-pino'
import { UsersManager } from '../../applications/users/services/users-manager.service'
import { exportConfiguration } from '../../configuration/config.environment'
import { AuthAnonymousGuard } from './auth-anonymous.guard'
import { AuthAnonymousStrategy } from './auth-anonymous.strategy'

describe(AuthAnonymousGuard.name, () => {
  let authAnonymousGuard: AuthAnonymousGuard
  let authAnonymousStrategy: AuthAnonymousStrategy
  let context: DeepMocked<ExecutionContext>

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        await ConfigModule.forRoot({
          load: [exportConfiguration],
          isGlobal: true
        }),
        PassportModule
      ],
      providers: [
        AuthAnonymousGuard,
        AuthAnonymousStrategy,
        { provide: UsersManager, useValue: {} },
        {
          provide: PinoLogger,
          useValue: {
            assign: () => undefined
          }
        }
      ]
    }).compile()
    authAnonymousStrategy = module.get<AuthAnonymousStrategy>(AuthAnonymousStrategy)
    authAnonymousGuard = module.get<AuthAnonymousGuard>(AuthAnonymousGuard)
  })

  it('should be defined', () => {
    expect(authAnonymousGuard).toBeDefined()
    expect(authAnonymousStrategy).toBeDefined()
  })

  it('should pass without a valid auth', async () => {
    context = createMock<ExecutionContext>()
    const spyAuthenticate = jest.spyOn(authAnonymousStrategy, 'authenticate')
    context.switchToHttp().getRequest.mockReturnValue({})
    expect(await authAnonymousGuard.canActivate(context)).toBe(true)
    expect(spyAuthenticate).toHaveBeenCalledTimes(1)
    spyAuthenticate.mockClear()
  })
})
