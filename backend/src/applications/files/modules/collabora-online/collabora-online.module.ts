/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Module } from '@nestjs/common'
import { CollaboraOnlineManager } from './collabora-online-manager.service'
import { CollaboraOnlineController } from './collabora-online.controller'
import { CollaboraOnlineGuard } from './collabora-online.guard'
import { CollaboraOnlineStrategy } from './collabora-online.strategy'

@Module({
  controllers: [CollaboraOnlineController],
  providers: [CollaboraOnlineManager, CollaboraOnlineGuard, CollaboraOnlineStrategy]
})
export class CollaboraOnlineModule {}
