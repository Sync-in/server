/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpService } from '@nestjs/axios'
import { Test, TestingModule } from '@nestjs/testing'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import { SpacesManager } from '../../spaces/services/spaces-manager.service'
import { FilesLockManager } from './files-lock-manager.service'
import { FilesManager } from './files-manager.service'
import { FilesQueries } from './files-queries.service'

describe(FilesManager.name, () => {
  let service: FilesManager

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: DB_TOKEN_PROVIDER, useValue: {} },
        { provide: FilesLockManager, useValue: {} },
        { provide: SpacesManager, useValue: {} },
        {
          provide: HttpService,
          useValue: {}
        },
        FilesManager,
        FilesQueries
      ]
    }).compile()

    service = module.get<FilesManager>(FilesManager)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })
})
