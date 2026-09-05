import { createMock, DeepMocked } from '@golevelup/ts-vitest'
import { BadRequestException, ExecutionContext } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { PinoLogger } from 'nestjs-pino'
import { UserModel } from '../../applications/users/models/user.model'
import { generateUserTest } from '../../applications/users/utils/test'
import { AuthProvider } from '../providers/auth-providers.models'
import { AuthLocalGuard } from './auth-local.guard'
import { AuthLocalStrategy } from './auth-local.strategy'

describe(AuthLocalGuard.name, () => {
  let authLocalGuard: AuthLocalGuard
  let authProvider: AuthProvider
  let userTest: UserModel
  let context: DeepMocked<ExecutionContext>

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthLocalGuard,
        AuthLocalStrategy,
        { provide: AuthProvider, useValue: {} },
        {
          provide: PinoLogger,
          useValue: {
            assign: () => undefined
          }
        }
      ]
    }).compile()

    authLocalGuard = module.get<AuthLocalGuard>(AuthLocalGuard)
    authProvider = module.get<AuthProvider>(AuthProvider)
    userTest = new UserModel(generateUserTest(), false)
    context = createMock<ExecutionContext>()
  })

  beforeEach(() => {
    userTest.password = ' password '
    authProvider.validateUser = vi.fn().mockReturnValueOnce(userTest)
    context.switchToHttp().getRequest.mockReturnValue({
      raw: { user: '' },
      body: { login: userTest.login, password: userTest.password }
    })
  })

  it('should validate the user authentication', async () => {
    expect(await authLocalGuard.canActivate(context)).toBe(true)
    expect(authProvider.validateUser).toHaveBeenCalledWith(userTest.login, ' password ', undefined)
    expect(userTest.password).toBeUndefined()
  })

  it('should not validate the user authentication', async () => {
    authProvider.validateUser = vi.fn().mockReturnValueOnce(null)
    await expect(authLocalGuard.canActivate(context)).rejects.toThrow(/password/i)
  })

  it.each(['login', 'password'])('should reject %s in query parameters', (field) => {
    Object.assign(context.switchToHttp().getRequest(), { query: { [field]: 'value' } })
    expect(() => authLocalGuard.canActivate(context)).toThrow(BadRequestException)
    expect(authProvider.validateUser).not.toHaveBeenCalled()
  })
})
