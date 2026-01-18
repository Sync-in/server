/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Test, TestingModule } from '@nestjs/testing'
import { AuthManager } from './auth.service'

describe(AuthManager.name, () => {
  let authManager: AuthManager

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthManager, { provide: JwtService, useValue: {} }, { provide: ConfigService, useValue: { get: () => null } }]
    }).compile()

    module.useLogger(['fatal'])
    authManager = module.get<AuthManager>(AuthManager)
  })

  it('should be defined', () => {
    expect(authManager).toBeDefined()
  })
})
