/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { DynamicModule, Module } from '@nestjs/common'
import { ScheduleModule as NestScheduleModule } from '@nestjs/schedule'
import cluster from 'node:cluster'
import { SCHEDULER_ENV, SCHEDULER_STATE } from './scheduler.constants'

@Module({})
export class SchedulerModule {
  static register(): DynamicModule {
    if (cluster.isWorker && process.env[SCHEDULER_ENV] === SCHEDULER_STATE.ENABLED) {
      return {
        global: true,
        module: SchedulerModule,
        imports: [NestScheduleModule.forRoot()]
      }
    } else {
      // do not initialize the ScheduleModule dependency; all calls to Interval, Cron ... will be ignored
      return { module: SchedulerModule }
    }
  }
}
