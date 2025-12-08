/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpService } from '@nestjs/axios'
import { JwtService } from '@nestjs/jwt'
import { Test, TestingModule } from '@nestjs/testing'
import { Cache } from '../../../../infrastructure/cache/services/cache.service'
import { ContextManager } from '../../../../infrastructure/context/services/context-manager.service'
import { UsersManager } from '../../../users/services/users-manager.service'
import { FilesLockManager } from '../../services/files-lock-manager.service'
import { OnlyOfficeManager } from './only-office-manager.service'

describe(OnlyOfficeManager.name, () => {
  let service: OnlyOfficeManager

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnlyOfficeManager,
        ContextManager,
        { provide: Cache, useValue: {} },
        { provide: HttpService, useValue: {} },
        { provide: JwtService, useValue: {} },
        { provide: UsersManager, useValue: {} },
        { provide: FilesLockManager, useValue: {} }
      ]
    }).compile()

    service = module.get<OnlyOfficeManager>(OnlyOfficeManager)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })
})
