/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { createMock, DeepMocked } from '@golevelup/ts-jest'
import { ExecutionContext } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { PinoLogger } from 'nestjs-pino'
import { UserModel } from '../../applications/users/models/user.model'
import { generateUserTest } from '../../applications/users/utils/test'
import { WEBDAV_BASE_PATH } from '../../applications/webdav/constants/routes'
import { Cache } from '../../infrastructure/cache/services/cache.service'
import { AuthMethod } from '../models/auth-method'
import { AuthBasicGuard } from './auth-basic.guard'
import { AuthBasicStrategy } from './auth-basic.strategy'

describe(AuthBasicGuard.name, () => {
  let authBasicGuard: AuthBasicGuard
  let authBasicStrategy: AuthBasicStrategy
  let authMethod: AuthMethod
  let cache: Cache
  let userTest: UserModel
  let encodedAuth: string
  let context: DeepMocked<ExecutionContext>

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthBasicGuard,
        AuthBasicStrategy,
        {
          provide: AuthMethod,
          useValue: {
            validateUser: async () => null
          }
        },
        {
          provide: PinoLogger,
          useValue: {
            assign: () => undefined,
            error: jest.fn()
          }
        },
        {
          provide: Cache,
          useValue: {
            get: (_key: string) => undefined,
            set: async (_key: string, _value: string, _ttl: number) => undefined,
            genSlugKey: () => 'test'
          }
        }
      ]
    }).compile()

    authBasicGuard = module.get<AuthBasicGuard>(AuthBasicGuard)
    authBasicStrategy = module.get<AuthBasicStrategy>(AuthBasicStrategy)
    authMethod = module.get<AuthMethod>(AuthMethod)
    cache = module.get<Cache>(Cache)
    userTest = new UserModel(generateUserTest(), false)
    encodedAuth = Buffer.from(`${userTest.login}:${userTest.password}`).toString('base64')
    context = createMock<ExecutionContext>()
  })

  it('should be defined', () => {
    expect(authBasicGuard).toBeDefined()
    expect(authBasicStrategy).toBeDefined()
    expect(authMethod).toBeDefined()
    expect(cache).toBeDefined()
    expect(encodedAuth).toBeDefined()
    expect(userTest).toBeDefined()
    expect(userTest.password).toBeDefined()
  })

  it('should validate the user authentication', async () => {
    authMethod.validateUser = jest.fn().mockReturnValueOnce(userTest)
    context.switchToHttp().getRequest.mockReturnValue({
      raw: { user: '' },
      headers: { authorization: `Basic ${encodedAuth}` }
    })
    expect(await authBasicGuard.canActivate(context)).toBe(true)
    expect(userTest.password).toBeUndefined()
  })

  it('should validate the user authentication with password containing colon', async () => {
    const passwordWithColon = 'pass:word:123'
    const userWithColonPassword = new UserModel({ ...generateUserTest(), password: passwordWithColon }, false)
    const encodedAuthWithColon = Buffer.from(`${userWithColonPassword.login}:${passwordWithColon}`).toString('base64')

    authMethod.validateUser = jest.fn().mockImplementation((login: string, password: string) => {
      expect(login).toBe(userWithColonPassword.login)
      expect(password).toBe(passwordWithColon)
      return userWithColonPassword
    })
    context.switchToHttp().getRequest.mockReturnValue({
      raw: { user: '' },
      headers: { authorization: `Basic ${encodedAuthWithColon}` }
    })
    expect(await authBasicGuard.canActivate(context)).toBe(true)
    expect(userWithColonPassword.password).toBeUndefined()
  })

  it('should validate the user authentication with cache', async () => {
    cache.get = jest.fn().mockReturnValueOnce(userTest)
    context.switchToHttp().getRequest.mockReturnValue({
      raw: { user: '' },
      headers: { authorization: `Basic ${encodedAuth}` }
    })
    expect(await authBasicGuard.canActivate(context)).toBe(true)
  })

  it('should not validate the user authentication when cache returns null (explicitly unauthorized)', async () => {
    cache.get = jest.fn().mockReturnValueOnce(null)
    context.switchToHttp().getRequest.mockReturnValue({
      raw: { user: '' },
      headers: { authorization: `Basic ${encodedAuth}` }
    })
    await expect(authBasicGuard.canActivate(context)).rejects.toThrow()
  })

  it('should not validate the user authentication when cache returns undefined and database return null', async () => {
    cache.get = jest.fn().mockReturnValueOnce(undefined)
    authMethod.validateUser = jest.fn().mockReturnValueOnce(null)
    jest.spyOn(cache, 'set').mockRejectedValueOnce(new Error('cache failed'))
    context.switchToHttp().getRequest.mockReturnValue({
      raw: { user: '' },
      headers: { authorization: `Basic ${encodedAuth}` }
    })
    const loggerSpy = jest
      .spyOn(authBasicStrategy['logger'], 'error') // <-- spy the SAME instance used in the class
      .mockImplementation(() => undefined)
    await expect(authBasicGuard.canActivate(context)).rejects.toThrow()
    expect(loggerSpy).toHaveBeenCalled()
    expect(loggerSpy.mock.calls[0][0]).toEqual(expect.stringContaining('cache failed'))
  })

  it('should not validate the user authentication', async () => {
    context.switchToHttp().getRequest.mockReturnValue({
      raw: { user: '' },
      headers: { authorization: `Basic ${encodedAuth}` }
    })
    await expect(authBasicGuard.canActivate(context)).rejects.toThrow()
  })

  it('should throw error due to malformed authorization header', async () => {
    // headers with capitals not working
    context.switchToHttp().getRequest.mockReturnValueOnce({
      raw: { user: '' },
      headers: { AUTHORIZATION: 'Basic foo' }
    })
    await expect(authBasicGuard.canActivate(context)).rejects.toThrow()
    context.switchToHttp().getRequest.mockReturnValueOnce({
      raw: { user: '' }
    })
    await expect(authBasicGuard.canActivate(context)).rejects.toThrow()
  })

  it(`should valid OPTIONS method without authentication header on "/" and "/${WEBDAV_BASE_PATH}/*" paths `, async () => {
    for (const url of ['', `/${WEBDAV_BASE_PATH}`, `/${WEBDAV_BASE_PATH}/foo/bar`]) {
      context.switchToHttp().getRequest.mockReturnValueOnce({
        method: 'OPTIONS',
        originalUrl: url,
        raw: { user: '' }
      })
      expect(await authBasicGuard.canActivate(context)).toBe(true)
    }
  })

  it('should not valid OPTIONS method with other paths', async () => {
    context.switchToHttp().getRequest.mockReturnValueOnce({
      method: 'OPTIONS',
      originalUrl: '/foo',
      raw: { user: '' }
    })
    await expect(authBasicGuard.canActivate(context)).rejects.toThrow()
  })
})
