/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { Test, TestingModule } from '@nestjs/testing'
import { NotificationsManager } from '../applications/notifications/services/notifications-manager.service'
import { UserModel } from '../applications/users/models/user.model'
import { UsersManager } from '../applications/users/services/users-manager.service'
import { generateUserTest } from '../applications/users/utils/test'
import { convertHumanTimeToSeconds } from '../common/functions'
import { currentTimeStamp } from '../common/shared'
import { exportConfiguration } from '../configuration/config.environment'
import { Cache } from '../infrastructure/cache/services/cache.service'
import { DB_TOKEN_PROVIDER } from '../infrastructure/database/constants'
import { AuthConfig } from './auth.config'
import { AuthController } from './auth.controller'
import { AuthManager } from './auth.service'
import { TOKEN_PATHS } from './constants/auth'
import { LoginResponseDto } from './dto/login-response.dto'
import { TOKEN_TYPE } from './interfaces/token.interface'
import { AuthProvider2FA } from './providers/two-fa/auth-provider-two-fa.service'
import { AuthTwoFaGuard } from './providers/two-fa/auth-two-fa-guard'

describe(AuthController.name, () => {
  let module: TestingModule
  let authController: AuthController
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
        AuthTwoFaGuard,
        { provide: DB_TOKEN_PROVIDER, useValue: {} },
        { provide: Cache, useValue: {} },
        { provide: UsersManager, useValue: {} },
        { provide: NotificationsManager, useValue: {} }
      ]
    }).compile()

    module.useLogger(['fatal'])
    authConfig = module.get<ConfigService>(ConfigService).get<AuthConfig>('auth')
    authController = module.get<AuthController>(AuthController)
    userTest = new UserModel({ ...generateUserTest(), id: 888 }, false)
  })

  afterAll(async () => {
    await module.close()
  })

  it('should be defined', () => {
    expect(authConfig).toBeDefined()
    expect(authController).toBeDefined()
    expect(userTest).toBeDefined()
  })

  it('should set JWT in cookies', async () => {
    const res: any = { setCookie: jest.fn() }
    const result = await authController.login(userTest, res)
    expect(result).toBeDefined()
    expect(result).toBeInstanceOf(LoginResponseDto)
    expect(res.setCookie).toHaveBeenCalledTimes(4)
    expect(result.token.access_expiration).toBeCloseTo(convertHumanTimeToSeconds(authConfig.token.access.expiration) + currentTimeStamp(), -1)
    expect(result.token.refresh_expiration).toBeCloseTo(convertHumanTimeToSeconds(authConfig.token.refresh.expiration) + currentTimeStamp(), -1)
  })

  it('should clear JWT in cookies', async () => {
    const res: any = { clearCookie: jest.fn() }
    await expect(authController.logout(res)).resolves.not.toThrow()
    expect(res.clearCookie).toHaveBeenCalledTimes(Object.keys(TOKEN_PATHS).length)
  })

  it('should refresh JWT in cookies', async () => {
    userTest.exp = currentTimeStamp() + convertHumanTimeToSeconds('30s')
    const res: any = { setCookie: jest.fn() }
    const result = await authController.refreshCookies(userTest, res)
    expect(result).toBeDefined()
    expect(res.setCookie).toHaveBeenCalledTimes(4)
    expect(result.access_expiration).toBeCloseTo(convertHumanTimeToSeconds(authConfig.token.access.expiration) + currentTimeStamp(), -1)
    expect(result.refresh_expiration).toBe(userTest.exp)
  })

  it('should not refresh JWT in cookies', async () => {
    userTest.exp = currentTimeStamp() - 1
    const res: any = { setCookie: jest.fn() }
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
