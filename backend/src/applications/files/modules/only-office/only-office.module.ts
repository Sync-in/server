/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Module } from '@nestjs/common'
import { OnlyOfficeManager } from './only-office-manager.service'
import { OnlyOfficeController } from './only-office.controller'
import { OnlyOfficeGuard } from './only-office.guard'
import { OnlyOfficeStrategy } from './only-office.strategy'

@Module({
  controllers: [OnlyOfficeController],
  providers: [OnlyOfficeManager, OnlyOfficeGuard, OnlyOfficeStrategy]
})
export class OnlyOfficeModule {}
