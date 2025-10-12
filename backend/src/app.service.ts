/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Injectable, Logger } from '@nestjs/common'
import { setupPrimary } from '@socket.io/cluster-adapter'
import cluster, { Worker } from 'node:cluster'
import { cpus } from 'node:os'
import process from 'node:process'
import { configuration } from './configuration/config.environment'
import { SCHEDULER_ENV, SCHEDULER_STATE } from './infrastructure/scheduler/scheduler.constants'

@Injectable()
export class AppService {
  private static readonly logger = new Logger(AppService.name)
  static schedulerPID: number

  static clusterize(bootstrap: () => void) {
    if (cluster.isPrimary) {
      if (configuration.websocket.adapter === 'cluster') {
        // setup connections between the workers
        setupPrimary()
      }
      AppService.logger.log(`Workers: ${configuration.server.workers} / CPU cores: ${cpus().length}`)
      AppService.logger.log(`[Master:${process.pid}] started`)
      for (let i = 0; i < configuration.server.workers; i++) {
        AppService.forkProcess(i === configuration.server.workers - 1)
      }
      cluster.on('exit', (worker: Worker, code: number, signal: string) => {
        AppService.logger.log(`[Worker:${worker.process.pid}] (code: ${code}, signal: ${signal}) died.`)
        if (configuration.server.restartOnFailure) {
          const isScheduler = worker.process.pid === AppService.schedulerPID
          AppService.logger.log(`[Worker:${worker.process.pid}] restarting ${isScheduler ? `(with Scheduler)` : ''}...`)
          AppService.forkProcess(isScheduler)
        }
      })
    } else {
      AppService.logger.log(`[Worker:${process.pid}] started`)
      bootstrap()
    }
  }

  static forkProcess(isScheduler: boolean) {
    const w: Worker = cluster.fork({ [SCHEDULER_ENV]: isScheduler ? SCHEDULER_STATE.ENABLED : SCHEDULER_STATE.DISABLED })
    if (isScheduler) {
      AppService.schedulerPID = w.process.pid
      AppService.logger.log(`[Worker:${w.process.pid}] Scheduler role enabled`)
    }
  }
}
