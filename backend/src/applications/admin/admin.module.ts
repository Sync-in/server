/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Module } from '@nestjs/common'
import { AdminSchedulerService } from './services/admin-scheduler.service'
import { AdminService } from './services/admin.service'

@Module({
  controllers: [],
  providers: [AdminService, AdminSchedulerService]
})
export class AdminModule {}
