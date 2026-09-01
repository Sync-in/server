import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Test, TestingModule } from '@nestjs/testing'
import { USER_ROLE } from '../applications/users/constants/user'
import { UserModel } from '../applications/users/models/user.model'
import { convertHumanTimeToSeconds } from '../common/functions'
import { currentTimeStamp } from '../common/shared'
import { configuration } from '../configuration/config.environment'
import { AuthManager } from './auth.service'
import { TOKEN_TYPE } from './interfaces/token.interface'
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

  it('should preserve the authentication method when refreshing cookies', async () => {
    const user = new UserModel({
      id: 1,
      login: 'alice',
      email: 'alice@example.com',
      firstName: 'Alice',
      lastName: 'Doe',
      language: 'en',
      role: USER_ROLE.USER,
      authSession: AUTH_SESSION.OIDC,
      exp: currentTimeStamp() + 3600
    } as any)
    const res = { setCookie: vi.fn() }

    const response = await authManager.refreshCookies(user, res as any)

    expect(response.user.authSession).toBe(AUTH_SESSION.OIDC)
    expect(jwtService.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: expect.objectContaining({ authSession: AUTH_SESSION.OIDC })
      }),
      expect.any(Object)
    )
  })

  it('should keep the CSRF cookie alive as long as the access cookie when refreshing near expiration', async () => {
    const user = new UserModel({
      id: 1,
      login: 'alice',
      email: 'alice@example.com',
      firstName: 'Alice',
      lastName: 'Doe',
      language: 'en',
      role: USER_ROLE.USER,
      exp: currentTimeStamp() + 30
    } as any)
    const res = { setCookie: vi.fn() }

    await authManager.refreshCookies(user, res as any)

    const accessExpiration = convertHumanTimeToSeconds(configuration.auth.token[TOKEN_TYPE.ACCESS].expiration)
    expect(res.setCookie).toHaveBeenCalledWith(
      configuration.auth.token[TOKEN_TYPE.CSRF].name,
      expect.any(String),
      expect.objectContaining({ maxAge: accessExpiration })
    )
  })
})
