import fastifyCookie, { sign } from '@fastify/cookie'
import { ExecutionContext, UnauthorizedException, ValidationPipe } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test, TestingModule } from '@nestjs/testing'
import { PinoLogger } from 'nestjs-pino'
import { NotificationsManager } from '../applications/notifications/services/notifications-manager.service'
import { USER_ROLE } from '../applications/users/constants/user'
import { UserRolesGuard } from '../applications/users/guards/roles.guard'
import { UserModel } from '../applications/users/models/user.model'
import { UsersManager } from '../applications/users/services/users-manager.service'
import { generateUserTest } from '../applications/users/utils/test'
import { convertHumanTimeToSeconds } from '../common/functions'
import { currentTimeStamp } from '../common/shared'
import { exportConfiguration } from '../configuration/config.environment'
import { Cache } from '../infrastructure/cache/cache.service'
import { DB_TOKEN_PROVIDER } from '../infrastructure/database/constants'
import { AuthConfig } from './auth.config'
import { AuthController } from './auth.controller'
import { AuthManager } from './auth.service'
import { ACCESS_KEY, CSRF_KEY, TOKEN_PATHS, TWO_FA_HEADER_CODE, TWO_FA_HEADER_PASSWORD } from './constants/auth'
import { API_AUTH_SETTINGS, API_AUTH_TOKEN, API_TWO_FA_ADMIN_RESET_USER, API_TWO_FA_ENABLE, API_TWO_FA_LOGIN_VERIFY } from './constants/routes'
import { AUTH_TOKEN_SKIP } from './decorators/auth-token-skip.decorator'
import { LoginResponseDto, LoginVerify2FaDto } from './dto/login-response.dto'
import { AuthLocalGuard } from './guards/auth-local.guard'
import { JwtPayload } from './interfaces/jwt-payload.interface'
import { TOKEN_TYPE } from './interfaces/token.interface'
import { AuthProvider2FA } from './providers/two-fa/auth-provider-two-fa.service'
import { AuthTokenTwoFaGuard } from './providers/two-fa/guards/auth-token-two-fa.guard'
import { AuthTokenTwoFaStrategy } from './providers/two-fa/guards/auth-token-two-fa.strategy'
import { AuthTwoFaVerificationGuard } from './providers/two-fa/guards/auth-two-fa-verification.guard'
import { TwoFaVerifyDto, TwoFaVerifyWithPasswordDto } from './providers/two-fa/auth-two-fa.dtos'

describe(AuthController.name, () => {
  let module: TestingModule
  let authController: AuthController
  let authManager: AuthManager
  let authProvider2FA: AuthProvider2FA
  let authConfig: AuthConfig
  let userTest: UserModel

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [await ConfigModule.forRoot({ load: [exportConfiguration], isGlobal: true }), PassportModule],
      controllers: [AuthController],
      providers: [
        ConfigService,
        AuthManager,
        JwtService,
        AuthProvider2FA,
        AuthTwoFaVerificationGuard,
        { provide: DB_TOKEN_PROVIDER, useValue: {} },
        { provide: Cache, useValue: {} },
        { provide: UsersManager, useValue: { updateAccesses: vi.fn().mockResolvedValue(undefined) } },
        { provide: NotificationsManager, useValue: {} }
      ]
    }).compile()

    module.useLogger(['fatal'])
    authConfig = module.get<ConfigService>(ConfigService).get<AuthConfig>('auth')
    authController = module.get<AuthController>(AuthController)
    authManager = module.get<AuthManager>(AuthManager)
    authProvider2FA = module.get<AuthProvider2FA>(AuthProvider2FA)
    userTest = new UserModel({ ...generateUserTest(), id: 888 }, false)
  })

  afterAll(async () => {
    await module.close()
  })

  beforeEach(() => {
    vi.restoreAllMocks()
    userTest.exp = undefined
  })

  it('should be defined', () => {
    expect(authConfig).toBeDefined()
    expect(authController).toBeDefined()
    expect(userTest).toBeDefined()
  })

  it('should set JWT in cookies', async () => {
    const res: any = { setCookie: vi.fn() }
    const result = await authController.login(userTest, res)
    expect(result).toBeDefined()
    expect(result).toBeInstanceOf(LoginResponseDto)
    expect(res.setCookie).toHaveBeenCalledTimes(4)
    expect(result.token.access_expiration).toBeCloseTo(convertHumanTimeToSeconds(authConfig.token.access.expiration) + currentTimeStamp(), -1)
    expect(result.token.refresh_expiration).toBeCloseTo(convertHumanTimeToSeconds(authConfig.token.refresh.expiration) + currentTimeStamp(), -1)
  })

  it('should set temporary JWT cookies when login requires 2FA', async () => {
    const twoFaUser = new UserModel({ ...generateUserTest(), id: userTest.id, twoFaEnabled: true }, false)
    const res: any = { setCookie: vi.fn() }

    const result = await authController.login(twoFaUser, res)

    expect(result).toBeInstanceOf(LoginVerify2FaDto)
    expect(result.user).toEqual({ twoFaEnabled: true })
    expect(res.setCookie).toHaveBeenCalledTimes(2)
    expect(res.setCookie).toHaveBeenCalledWith(
      authConfig.token[TOKEN_TYPE.ACCESS_2FA].name,
      expect.any(String),
      expect.objectContaining({
        path: TOKEN_PATHS[TOKEN_TYPE.ACCESS_2FA],
        httpOnly: true
      })
    )
    expect(res.setCookie).toHaveBeenCalledWith(
      authConfig.token[TOKEN_TYPE.CSRF_2FA].name,
      expect.any(String),
      expect.objectContaining({
        path: TOKEN_PATHS[TOKEN_TYPE.CSRF_2FA],
        httpOnly: false
      })
    )
  })

  it('should clear JWT in cookies', async () => {
    const res: any = { clearCookie: vi.fn() }
    await expect(authController.logout(res)).resolves.not.toThrow()
    expect(res.clearCookie).toHaveBeenCalledTimes(Object.keys(TOKEN_PATHS).length)
    for (const [type, path] of Object.entries(TOKEN_PATHS)) {
      expect(res.clearCookie).toHaveBeenCalledWith(authConfig.token[type].name, { path })
    }
  })

  it('should refresh JWT in cookies', async () => {
    const currentTime = currentTimeStamp()
    userTest.exp = currentTime + convertHumanTimeToSeconds('30s')
    const res: any = { setCookie: vi.fn() }
    const result = await authController.refreshCookies(userTest, res)
    expect(result).toBeDefined()
    expect(result).toBeInstanceOf(LoginResponseDto)
    expect(result.user).toBe(userTest)
    expect(res.setCookie).toHaveBeenCalledTimes(4)
    expect(result.token.access_expiration).toBeCloseTo(convertHumanTimeToSeconds(authConfig.token.access.expiration) + currentTime, -1)
    expect(result.token.refresh_expiration).toBe(userTest.exp)
  })

  it('should not refresh JWT in cookies', async () => {
    userTest.exp = currentTimeStamp() - 1
    const res: any = { setCookie: vi.fn() }
    await expect(authController.refreshCookies(userTest, res)).rejects.toThrow()
  })

  it('should get JWT in response body', async () => {
    const result = await authController.token(userTest)
    expect(result[TOKEN_TYPE.ACCESS]).toBeDefined()
    expect(result[TOKEN_TYPE.REFRESH]).toBeDefined()
    expect(result[`${TOKEN_TYPE.ACCESS}_expiration`]).toBeCloseTo(
      convertHumanTimeToSeconds(authConfig.token.access.expiration) + currentTimeStamp(),
      -1
    )
    expect(result[`${TOKEN_TYPE.REFRESH}_expiration`]).toBeCloseTo(
      convertHumanTimeToSeconds(authConfig.token.refresh.expiration) + currentTimeStamp(),
      -1
    )
  })

  it('should return false when external authentication settings are disabled', () => {
    const authSettingsSpy = vi.spyOn(authManager, 'authSettings').mockReturnValue(false)

    expect(authController.authSettings()).toBe(false)
    expect(authSettingsSpy).toHaveBeenCalledOnce()
  })

  it('should return external authentication settings', () => {
    const settings = {
      loginUrl: '/api/auth/oidc/login',
      autoRedirect: true,
      buttonText: 'Continue with SSO'
    }
    vi.spyOn(authManager, 'authSettings').mockReturnValue(settings)

    expect(authController.authSettings()).toEqual(settings)
  })

  it('should initialize 2FA for the current user', async () => {
    const setup = { secret: 'secret', qrDataUrl: 'data:image/png;base64,test' }
    const initTwoFactorSpy = vi.spyOn(authProvider2FA, 'initTwoFactor').mockResolvedValue(setup)

    await expect(authController.twoFaInit(userTest)).resolves.toEqual(setup)
    expect(initTwoFactorSpy).toHaveBeenCalledWith(userTest)
  })

  it('should enable 2FA with the request and verification payload', async () => {
    const body: TwoFaVerifyWithPasswordDto = { code: '123456', password: 'password' }
    const req = { user: userTest, ip: '127.0.0.1' } as any
    const result = { success: true, message: '', recoveryCodes: ['code'] }
    const enableTwoFactorSpy = vi.spyOn(authProvider2FA, 'enableTwoFactor').mockResolvedValue(result)

    await expect(authController.twoFaEnable(body, req)).resolves.toEqual(result)
    expect(enableTwoFactorSpy).toHaveBeenCalledWith(body, req)
  })

  it('should disable 2FA with the request and verification payload', async () => {
    const body: TwoFaVerifyWithPasswordDto = { code: '123456', password: 'password' }
    const req = { user: userTest, ip: '127.0.0.1' } as any
    const result = { success: true, message: '' }
    const disableTwoFactorSpy = vi.spyOn(authProvider2FA, 'disableTwoFactor').mockResolvedValue(result)

    await expect(authController.twoFaDisable(body, req)).resolves.toEqual(result)
    expect(disableTwoFactorSpy).toHaveBeenCalledWith(body, req)
  })

  it('should create final cookies and clear the temporary cookie after successful 2FA login', async () => {
    const body: TwoFaVerifyDto = { code: '123456' }
    const twoFaUser = new UserModel({ ...generateUserTest(), id: userTest.id, twoFaEnabled: true }, false)
    const req = { user: twoFaUser, ip: '127.0.0.1' } as any
    const res: any = { setCookie: vi.fn(), clearCookie: vi.fn() }
    vi.spyOn(authProvider2FA, 'loadUser').mockResolvedValue(twoFaUser)
    vi.spyOn(authProvider2FA, 'validateTwoFactorCode').mockReturnValue({ success: true, message: '' })

    const result = await authController.twoFaLogin(body, req, res)

    expect(result).toEqual(expect.objectContaining({ success: true, user: twoFaUser }))
    expect(res.setCookie).toHaveBeenCalledTimes(4)
    expect(res.clearCookie).toHaveBeenCalledWith(ACCESS_KEY, {
      path: TOKEN_PATHS[TOKEN_TYPE.ACCESS_2FA],
      httpOnly: true
    })
  })

  it('should not create or clear cookies after failed 2FA login', async () => {
    const body: TwoFaVerifyDto = { code: '000000' }
    const twoFaUser = new UserModel({ ...generateUserTest(), id: userTest.id, twoFaEnabled: true }, false)
    const req = { user: twoFaUser, ip: '127.0.0.1' } as any
    const res: any = { setCookie: vi.fn(), clearCookie: vi.fn() }
    vi.spyOn(authProvider2FA, 'loadUser').mockResolvedValue(twoFaUser)
    vi.spyOn(authProvider2FA, 'validateTwoFactorCode').mockReturnValue({ success: false, message: 'Incorrect code or password' })

    const result = await authController.twoFaLogin(body, req, res)

    expect(result).toEqual({ success: false, message: 'Incorrect code or password' })
    expect(res.setCookie).not.toHaveBeenCalled()
    expect(res.clearCookie).not.toHaveBeenCalled()
  })

  it('should reset 2FA for the selected user', async () => {
    const result = { success: true, message: '' }
    const adminResetUserTwoFaSpy = vi.spyOn(authProvider2FA, 'adminResetUserTwoFa').mockResolvedValue(result)

    await expect(authController.twoFaReset(42)).resolves.toEqual(result)
    expect(adminResetUserTwoFaSpy).toHaveBeenCalledWith(42)
  })

  it('should refresh JWT in response body', async () => {
    userTest.exp = currentTimeStamp() + convertHumanTimeToSeconds('30s')
    const result = await authController.refreshToken(userTest)
    expect(result[TOKEN_TYPE.ACCESS]).toBeDefined()
    expect(result[TOKEN_TYPE.REFRESH]).toBeDefined()
    expect(result[`${TOKEN_TYPE.ACCESS}_expiration`]).toBeCloseTo(
      convertHumanTimeToSeconds(authConfig.token.access.expiration) + currentTimeStamp(),
      -1
    )
    expect(result[`${TOKEN_TYPE.REFRESH}_expiration`]).toBe(userTest.exp)
  })

  it('should not refresh JWT in response body', async () => {
    userTest.exp = currentTimeStamp() - 1
    await expect(authController.refreshToken(userTest)).rejects.toThrow()
  })
})

describe(`${AuthController.name} HTTP`, () => {
  let app: NestFastifyApplication
  let authManager: AuthManager
  let authProvider2FA: AuthProvider2FA
  let jwtService: JwtService
  let authConfig: AuthConfig
  let userTest: UserModel
  let requestUser: UserModel | undefined

  beforeAll(async () => {
    const testingModuleBuilder = Test.createTestingModule({
      imports: [await ConfigModule.forRoot({ load: [exportConfiguration], isGlobal: true }), PassportModule],
      controllers: [AuthController],
      providers: [
        ConfigService,
        AuthManager,
        JwtService,
        AuthProvider2FA,
        AuthTwoFaVerificationGuard,
        AuthTokenTwoFaGuard,
        AuthTokenTwoFaStrategy,
        UserRolesGuard,
        { provide: PinoLogger, useValue: { assign: vi.fn() } },
        {
          provide: APP_GUARD,
          inject: [Reflector],
          useFactory: (reflector: Reflector) => ({
            canActivate: (context: ExecutionContext) => {
              const skip = reflector.getAllAndOverride<boolean>(AUTH_TOKEN_SKIP, [context.getHandler(), context.getClass()])
              if (skip) return true
              if (!requestUser) throw new UnauthorizedException()
              context.switchToHttp().getRequest().user = requestUser
              return true
            }
          })
        },
        { provide: DB_TOKEN_PROVIDER, useValue: {} },
        { provide: Cache, useValue: {} },
        { provide: UsersManager, useValue: { updateAccesses: vi.fn().mockResolvedValue(undefined) } },
        { provide: NotificationsManager, useValue: {} }
      ]
    })
    testingModuleBuilder.overrideGuard(AuthLocalGuard).useValue({
      canActivate: (context: ExecutionContext) => {
        context.switchToHttp().getRequest().user = userTest
        return true
      }
    })
    const module: TestingModule = await testingModuleBuilder.compile()

    module.useLogger(['fatal'])
    authConfig = module.get<ConfigService>(ConfigService).get<AuthConfig>('auth')
    authManager = module.get<AuthManager>(AuthManager)
    authProvider2FA = module.get<AuthProvider2FA>(AuthProvider2FA)
    jwtService = module.get<JwtService>(JwtService)
    userTest = new UserModel({ ...generateUserTest(), id: 888 }, false)
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await app.register(fastifyCookie, { secret: authConfig.token.csrf.secret })
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    vi.restoreAllMocks()
    requestUser = undefined
  })

  function createTwoFaUser(role = USER_ROLE.USER): UserModel {
    return new UserModel({ ...generateUserTest(), id: userTest.id, role, secrets: { twoFaSecret: 'encrypted-secret' } }, false)
  }

  function injectToken(code?: string) {
    return app.inject({
      method: 'POST',
      url: API_AUTH_TOKEN,
      headers: code ? { [TWO_FA_HEADER_CODE]: code } : undefined,
      body: { login: userTest.login, password: userTest.password }
    })
  }

  it('should reject token issuance without a 2FA code', async () => {
    vi.spyOn(authProvider2FA, 'loadUser').mockResolvedValueOnce(createTwoFaUser())
    const getTokensSpy = vi.spyOn(authManager, 'getTokens')

    const response = await injectToken()

    expect(response.statusCode).toBe(403)
    expect(response.json().message).toBe('Missing TWO-FA code')
    expect(getTokensSpy).not.toHaveBeenCalled()
  })

  it('should reject token issuance with an invalid 2FA code', async () => {
    vi.spyOn(authProvider2FA, 'loadUser').mockResolvedValue(createTwoFaUser())
    vi.spyOn(authProvider2FA, 'validateTwoFactorCode').mockReturnValue({ success: false, message: 'Incorrect code or password' })
    const getTokensSpy = vi.spyOn(authManager, 'getTokens')

    const response = await injectToken('000000')

    expect(response.statusCode).toBe(403)
    expect(response.json().message).toBe('Incorrect code or password')
    expect(getTokensSpy).not.toHaveBeenCalled()
  })

  it('should issue tokens with a valid 2FA code', async () => {
    const twoFaUser = createTwoFaUser()
    vi.spyOn(authProvider2FA, 'loadUser').mockResolvedValue(twoFaUser)
    const validateTwoFactorCodeSpy = vi.spyOn(authProvider2FA, 'validateTwoFactorCode').mockReturnValue({ success: true, message: '' })
    const getTokensSpy = vi.spyOn(authManager, 'getTokens')

    const response = await injectToken('123456')

    expect(response.statusCode).toBe(201)
    expect(response.json()).toEqual(
      expect.objectContaining({
        [TOKEN_TYPE.ACCESS]: expect.any(String),
        [TOKEN_TYPE.REFRESH]: expect.any(String)
      })
    )
    expect(validateTwoFactorCodeSpy).toHaveBeenCalledWith('123456', twoFaUser.secrets.twoFaSecret)
    expect(getTokensSpy).toHaveBeenCalledWith(userTest)
  })

  it('should issue tokens without a 2FA code when 2FA is disabled', async () => {
    vi.spyOn(authProvider2FA, 'loadUser').mockResolvedValueOnce(userTest)
    const verifySpy = vi.spyOn(authProvider2FA, 'verify')
    const getTokensSpy = vi.spyOn(authManager, 'getTokens')

    const response = await injectToken()

    expect(response.statusCode).toBe(201)
    expect(verifySpy).not.toHaveBeenCalled()
    expect(getTokensSpy).toHaveBeenCalledWith(userTest)
  })

  it('should expose authentication settings without authentication', async () => {
    vi.spyOn(authManager, 'authSettings').mockReturnValue(false)

    const response = await app.inject({ method: 'GET', url: API_AUTH_SETTINGS })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toBe(false)
  })

  it('should reject 2FA login verification without a temporary token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: API_TWO_FA_LOGIN_VERIFY,
      body: { code: '123456' }
    })

    expect(response.statusCode).toBe(401)
  })

  it('should verify 2FA login through the temporary token guard', async () => {
    const twoFaUser = createTwoFaUser()
    const csrfToken = 'temporary-csrf-token'
    const temporaryToken = await jwtService.signAsync(
      {
        tokenType: TOKEN_TYPE.ACCESS_2FA,
        identity: {
          id: twoFaUser.id,
          login: twoFaUser.login,
          language: twoFaUser.language,
          role: twoFaUser.role,
          twoFaEnabled: true
        },
        csrf: csrfToken
      } as JwtPayload,
      {
        secret: authConfig.token[TOKEN_TYPE.ACCESS_2FA].secret,
        expiresIn: 30
      }
    )
    vi.spyOn(authProvider2FA, 'loadUser').mockResolvedValue(twoFaUser)
    vi.spyOn(authProvider2FA, 'validateTwoFactorCode').mockReturnValue({ success: true, message: '' })

    const response = await app.inject({
      method: 'POST',
      url: API_TWO_FA_LOGIN_VERIFY,
      headers: { [CSRF_KEY]: sign(csrfToken, authConfig.token.csrf.secret) },
      cookies: { [authConfig.token[TOKEN_TYPE.ACCESS_2FA].name]: temporaryToken },
      body: { code: '123456' }
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toEqual(expect.objectContaining({ success: true }))
    const cookies = response.headers['set-cookie'] as string[]
    expect(cookies).toHaveLength(5)
    expect(cookies).toEqual(
      expect.arrayContaining([
        expect.stringMatching(new RegExp(`^${authConfig.token.access.name}=.+;.*Path=${TOKEN_PATHS[TOKEN_TYPE.ACCESS]}(?:;|$)`)),
        expect.stringMatching(new RegExp(`^${authConfig.token.refresh.name}=.+;.*Path=${TOKEN_PATHS[TOKEN_TYPE.REFRESH]}(?:;|$)`)),
        expect.stringMatching(new RegExp(`^${authConfig.token.ws.name}=.+;.*Path=${TOKEN_PATHS[TOKEN_TYPE.WS]}(?:;|$)`)),
        expect.stringMatching(new RegExp(`^${authConfig.token.csrf.name}=.+;.*Path=${TOKEN_PATHS[TOKEN_TYPE.CSRF]}(?:;|$)`)),
        expect.stringMatching(
          new RegExp(`^${authConfig.token[TOKEN_TYPE.ACCESS_2FA].name}=;.*Max-Age=0;.*Path=${TOKEN_PATHS[TOKEN_TYPE.ACCESS_2FA]}(?:;|$)`)
        )
      ])
    )
  })

  it('should reject unauthenticated requests to 2FA routes', async () => {
    const response = await app.inject({ method: 'GET', url: API_TWO_FA_ENABLE })

    expect(response.statusCode).toBe(401)
  })

  it('should allow a user to initialize 2FA', async () => {
    const setup = { secret: 'secret', qrDataUrl: 'data:image/png;base64,test' }
    requestUser = userTest
    const initTwoFactorSpy = vi.spyOn(authProvider2FA, 'initTwoFactor').mockResolvedValue(setup)

    const response = await app.inject({ method: 'GET', url: API_TWO_FA_ENABLE })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual(setup)
    expect(initTwoFactorSpy).toHaveBeenCalledWith(userTest)
  })

  it('should reject a user attempting an administrator 2FA reset', async () => {
    requestUser = userTest
    const adminResetUserTwoFaSpy = vi.spyOn(authProvider2FA, 'adminResetUserTwoFa')

    const response = await app.inject({
      method: 'POST',
      url: `${API_TWO_FA_ADMIN_RESET_USER}/42`
    })

    expect(response.statusCode).toBe(403)
    expect(adminResetUserTwoFaSpy).not.toHaveBeenCalled()
  })

  it('should allow an administrator to reset user 2FA', async () => {
    const administrator = createTwoFaUser(USER_ROLE.ADMINISTRATOR)
    requestUser = administrator
    const result = { success: true, message: '' }
    const loadUserSpy = vi.spyOn(authProvider2FA, 'loadUser').mockResolvedValue(administrator)
    const verifyUserPasswordSpy = vi.spyOn(authProvider2FA, 'verifyUserPassword').mockResolvedValue(undefined)
    const validateTwoFactorCodeSpy = vi.spyOn(authProvider2FA, 'validateTwoFactorCode').mockReturnValue({ success: true, message: '' })
    const adminResetUserTwoFaSpy = vi.spyOn(authProvider2FA, 'adminResetUserTwoFa').mockResolvedValue(result)

    const response = await app.inject({
      method: 'POST',
      url: `${API_TWO_FA_ADMIN_RESET_USER}/42`,
      headers: {
        [TWO_FA_HEADER_PASSWORD]: 'password',
        [TWO_FA_HEADER_CODE]: '123456'
      }
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toEqual(result)
    expect(loadUserSpy).toHaveBeenCalledWith(administrator.id, expect.any(String))
    expect(verifyUserPasswordSpy).toHaveBeenCalledWith(administrator, 'password', expect.any(String))
    expect(validateTwoFactorCodeSpy).toHaveBeenCalledWith('123456', administrator.secrets.twoFaSecret)
    expect(adminResetUserTwoFaSpy).toHaveBeenCalledWith(42)
  })

  it('should reject an administrator 2FA reset without password', async () => {
    const administrator = createTwoFaUser(USER_ROLE.ADMINISTRATOR)
    requestUser = administrator
    vi.spyOn(authProvider2FA, 'loadUser').mockResolvedValue(administrator)
    const adminResetUserTwoFaSpy = vi.spyOn(authProvider2FA, 'adminResetUserTwoFa')

    const response = await app.inject({
      method: 'POST',
      url: `${API_TWO_FA_ADMIN_RESET_USER}/42`
    })

    expect(response.statusCode).toBe(403)
    expect(response.json().message).toBe('Missing TWO-FA password')
    expect(adminResetUserTwoFaSpy).not.toHaveBeenCalled()
  })

  it('should reject an administrator 2FA reset without TOTP verification', async () => {
    const administrator = createTwoFaUser(USER_ROLE.ADMINISTRATOR)
    requestUser = administrator
    vi.spyOn(authProvider2FA, 'loadUser').mockResolvedValue(administrator)
    const verifyUserPasswordSpy = vi.spyOn(authProvider2FA, 'verifyUserPassword').mockResolvedValue(undefined)
    const adminResetUserTwoFaSpy = vi.spyOn(authProvider2FA, 'adminResetUserTwoFa')

    const response = await app.inject({
      method: 'POST',
      url: `${API_TWO_FA_ADMIN_RESET_USER}/42`,
      headers: { [TWO_FA_HEADER_PASSWORD]: 'password' }
    })

    expect(response.statusCode).toBe(403)
    expect(response.json().message).toBe('Missing TWO-FA code')
    expect(verifyUserPasswordSpy).toHaveBeenCalledWith(administrator, 'password', expect.any(String))
    expect(adminResetUserTwoFaSpy).not.toHaveBeenCalled()
  })

  it('should reject a non-numeric user id for an administrator 2FA reset', async () => {
    const administrator = createTwoFaUser(USER_ROLE.ADMINISTRATOR)
    requestUser = administrator
    vi.spyOn(authProvider2FA, 'loadUser').mockResolvedValue(administrator)
    vi.spyOn(authProvider2FA, 'verifyUserPassword').mockResolvedValue(undefined)
    vi.spyOn(authProvider2FA, 'validateTwoFactorCode').mockReturnValue({ success: true, message: '' })
    const adminResetUserTwoFaSpy = vi.spyOn(authProvider2FA, 'adminResetUserTwoFa')

    const response = await app.inject({
      method: 'POST',
      url: `${API_TWO_FA_ADMIN_RESET_USER}/invalid`,
      headers: {
        [TWO_FA_HEADER_PASSWORD]: 'password',
        [TWO_FA_HEADER_CODE]: '123456'
      }
    })

    expect(response.statusCode).toBe(400)
    expect(adminResetUserTwoFaSpy).not.toHaveBeenCalled()
  })
})
