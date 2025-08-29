/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { createMock, DeepMocked } from '@golevelup/ts-jest'
import { ExecutionContext } from '@nestjs/common'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { Test, TestingModule } from '@nestjs/testing'
import { PinoLogger } from 'nestjs-pino'
import { JwtPayload } from '../../../authentication/interfaces/jwt-payload.interface'
import { configuration } from '../../../configuration/config.environment'
import { ONLY_OFFICE_TOKEN_QUERY_PARAM_NAME } from '../constants/only-office'
import { API_FILES_ONLY_OFFICE_CALLBACK } from '../constants/routes'
import { FilesOnlyOfficeGuard } from './files-only-office.guard'
import { FilesOnlyOfficeStrategy } from './files-only-office.strategy'

describe(FilesOnlyOfficeGuard.name, () => {
  let jwtService: JwtService
  let filesOnlyOfficeGuard: FilesOnlyOfficeGuard
  let context: DeepMocked<ExecutionContext>
  let accessToken: string

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ global: true })],
      providers: [
        FilesOnlyOfficeGuard,
        FilesOnlyOfficeStrategy,
        {
          provide: PinoLogger,
          useValue: {
            assign: () => undefined
          }
        }
      ]
    }).compile()

    jwtService = module.get<JwtService>(JwtService)
    filesOnlyOfficeGuard = module.get<FilesOnlyOfficeGuard>(FilesOnlyOfficeGuard)
    context = createMock<ExecutionContext>()
    accessToken = await jwtService.signAsync({ identity: { id: 1, login: 'foo' } } as JwtPayload, {
      secret: configuration.auth.token.access.secret,
      expiresIn: 30
    })
  })

  it('should be defined', () => {
    expect(jwtService).toBeDefined()
    expect(filesOnlyOfficeGuard).toBeDefined()
    expect(accessToken).toBeDefined()
  })

  it('should not pass if enabled (or not) without a valid token', async () => {
    configuration.applications.files.onlyoffice.enabled = false
    context.switchToHttp().getRequest.mockReturnValue({
      url: `${API_FILES_ONLY_OFFICE_CALLBACK}`,
      raw: { user: '' }
    })
    expect(() => filesOnlyOfficeGuard.canActivate(context)).toThrow(/feature not enabled/i)
    configuration.applications.files.onlyoffice.enabled = true
    await expect(filesOnlyOfficeGuard.canActivate(context)).rejects.toThrow('Unauthorized')
  })

  it('should pass if enabled (or not) with a valid token', async () => {
    configuration.applications.files.onlyoffice.enabled = false
    context.switchToHttp().getRequest.mockReturnValue({
      url: `${API_FILES_ONLY_OFFICE_CALLBACK}?${ONLY_OFFICE_TOKEN_QUERY_PARAM_NAME}=${accessToken}`,
      raw: { user: '' }
    })
    expect(() => filesOnlyOfficeGuard.canActivate(context)).toThrow(/feature not enabled/i)
    configuration.applications.files.onlyoffice.enabled = true
    expect(await filesOnlyOfficeGuard.canActivate(context)).toBe(true)
    context.switchToHttp().getRequest.mockReturnValue({
      url: `${API_FILES_ONLY_OFFICE_CALLBACK}?${ONLY_OFFICE_TOKEN_QUERY_PARAM_NAME}=unvalidToken`,
      raw: { user: '' }
    })
    await expect(filesOnlyOfficeGuard.canActivate(context)).rejects.toThrow('Unauthorized')
  })
})
