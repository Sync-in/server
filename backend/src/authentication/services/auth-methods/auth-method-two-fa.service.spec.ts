/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Test, TestingModule } from '@nestjs/testing'
import { NotificationsManager } from '../../../applications/notifications/services/notifications-manager.service'
import { UsersManager } from '../../../applications/users/services/users-manager.service'
import { Cache } from '../../../infrastructure/cache/services/cache.service'
import { AuthMethod2FA } from './auth-method-two-fa.service'

describe(AuthMethod2FA.name, () => {
  let service: AuthMethod2FA

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthMethod2FA,
        { provide: Cache, useValue: {} },
        { provide: UsersManager, useValue: {} },
        { provide: NotificationsManager, useValue: {} }
      ]
    }).compile()

    service = module.get<AuthMethod2FA>(AuthMethod2FA)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })
})
