import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Test, TestingModule } from '@nestjs/testing'
import { USER_ROLE } from '../applications/users/constants/user'
import { UserModel } from '../applications/users/models/user.model'
import { AuthManager } from './auth.service'
import { AUTH_SESSION } from './providers/auth-providers.constants'

describe(AuthManager.name, () => {
  const jwtService = { signAsync: vi.fn() }
  let authManager: AuthManager

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthManager, { provide: JwtService, useValue: jwtService }, { provide: ConfigService, useValue: { get: () => null } }]
    }).compile()

    module.useLogger(['fatal'])
    authManager = module.get<AuthManager>(AuthManager)
  })

  beforeEach(() => {
    jwtService.signAsync.mockReset()
    jwtService.signAsync.mockResolvedValue('token')
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
      role: USER_ROLE.USER
    })
    const res = { setCookie: vi.fn() }

    const response = await authManager.setCookies(user, res as any, false, AUTH_SESSION.OIDC)

    expect(response.user.authSession).toBe(AUTH_SESSION.OIDC)
    expect(jwtService.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: expect.objectContaining({ authSession: AUTH_SESSION.OIDC })
      }),
      expect.any(Object)
    )
  })
})
