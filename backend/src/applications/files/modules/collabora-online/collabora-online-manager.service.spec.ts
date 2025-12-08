/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { JwtService } from '@nestjs/jwt'
import { Test, TestingModule } from '@nestjs/testing'
import { ContextManager } from '../../../../infrastructure/context/services/context-manager.service'
import { FilesLockManager } from '../../services/files-lock-manager.service'
import { CollaboraOnlineManager } from './collabora-online-manager.service'

describe(CollaboraOnlineManager.name, () => {
  let service: CollaboraOnlineManager

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CollaboraOnlineManager, ContextManager, { provide: JwtService, useValue: {} }, { provide: FilesLockManager, useValue: {} }]
    }).compile()

    service = module.get<CollaboraOnlineManager>(CollaboraOnlineManager)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })
})
