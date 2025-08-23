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
import { AuthMethod } from '../models/auth-method'
import { AuthLocalGuard } from './auth-local.guard'
import { AuthLocalStrategy } from './auth-local.strategy'

describe(AuthLocalGuard.name, () => {
  let authLocalGuard: AuthLocalGuard
  let authMethod: AuthMethod
  let userTest: UserModel
  let context: DeepMocked<ExecutionContext>

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthLocalGuard,
        AuthLocalStrategy,
        { provide: AuthMethod, useValue: {} },
        {
          provide: PinoLogger,
          useValue: {
            assign: () => undefined
          }
        }
      ]
    }).compile()

    authLocalGuard = module.get<AuthLocalGuard>(AuthLocalGuard)
    authMethod = module.get<AuthMethod>(AuthMethod)
    userTest = new UserModel(generateUserTest(), false)
    context = createMock<ExecutionContext>()
  })

  it('should be defined', () => {
    expect(authLocalGuard).toBeDefined()
    expect(authMethod).toBeDefined()
    expect(userTest).toBeDefined()
  })

  it('should validate the user authentication', async () => {
    authMethod.validateUser = jest.fn().mockReturnValueOnce(userTest)
    context.switchToHttp().getRequest.mockReturnValue({
      raw: { user: '' },
      body: {
        login: userTest.login,
        password: userTest.password
      }
    })
    expect(await authLocalGuard.canActivate(context)).toBe(true)
    expect(userTest.password).toBeUndefined()
  })

  it('should not validate the user authentication', async () => {
    userTest.password = 'password'
    authMethod.validateUser = jest.fn().mockReturnValueOnce(null)
    context.switchToHttp().getRequest.mockReturnValue({
      raw: { user: '' },
      body: {
        login: userTest.login,
        password: userTest.password
      }
    })
    await expect(authLocalGuard.canActivate(context)).rejects.toThrow(/password/i)
  })

  it('should throw error due to malformed body', async () => {
    authMethod.validateUser = jest.fn().mockReturnValueOnce(null)
    context.switchToHttp().getRequest.mockReturnValue({
      raw: { user: '' },
      body: null
    })
    await expect(authLocalGuard.canActivate(context)).rejects.toThrow()
  })
})
