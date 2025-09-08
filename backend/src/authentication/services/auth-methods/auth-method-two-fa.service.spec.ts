/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Test, TestingModule } from '@nestjs/testing'
import { AuthMethod2FA } from './auth-method-two-fa.service'

describe(AuthMethod2FA.name, () => {
  let service: AuthMethod2FA

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthMethod2FA]
    }).compile()

    service = module.get<AuthMethod2FA>(AuthMethod2FA)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })
})
