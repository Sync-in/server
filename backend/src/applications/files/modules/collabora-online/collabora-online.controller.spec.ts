/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Test, TestingModule } from '@nestjs/testing'
import { ContextInterceptor } from '../../../../infrastructure/context/interceptors/context.interceptor'
import { ContextManager } from '../../../../infrastructure/context/services/context-manager.service'
import { SpacesManager } from '../../../spaces/services/spaces-manager.service'
import { FilesMethods } from '../../services/files-methods.service'
import { CollaboraOnlineManager } from './collabora-online-manager.service'
import { CollaboraOnlineController } from './collabora-online.controller'

describe(CollaboraOnlineController.name, () => {
  let controller: CollaboraOnlineController

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CollaboraOnlineController],
      providers: [
        ContextManager,
        ContextInterceptor,
        { provide: CollaboraOnlineManager, useValue: {} },
        { provide: FilesMethods, useValue: {} },
        { provide: SpacesManager, useValue: {} }
      ]
    }).compile()

    controller = module.get<CollaboraOnlineController>(CollaboraOnlineController)
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })
})
