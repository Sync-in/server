import { Injectable, Logger } from '@nestjs/common'
import { setupPrimary } from '@socket.io/cluster-adapter'
import cluster, { Worker } from 'node:cluster'
import { cpus } from 'node:os'
import process from 'node:process'
import { configuration } from './configuration/config.environment'
import { SCHEDULER_ENV, SCHEDULER_STATE } from './infrastructure/scheduler/scheduler.constants'
import { SERVER_NAME } from './common/shared'

@Injectable()
export class AppService {
  static schedulerPID: number
  private static readonly logger = new Logger('SERVER')
  private static shuttingDown = false
  private static shutdownHooksRegistered = false

  static clusterize(bootstrap: () => Promise<void>) {
    AppService.logger.localInstance['options']['prefix'] = SERVER_NAME
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
      // Keep the primary alive while workers run their NestJS shutdown hooks.
      AppService.registerShutdownHooks()
      cluster.on('exit', (worker: Worker, code: number, signal: string) => {
        AppService.logger.log(`[Worker:${worker.process.pid}] (code: ${code}, signal: ${signal}) died.`)
        if (AppService.shuttingDown) {
          // A signal-triggered shutdown is intentional, not an error eligible for restartOnFailure.
          // Wait for every worker to exit before stopping the primary.
          if (!Object.values(cluster.workers ?? {}).some(Boolean)) {
            process.exit(0)
          }
        } else if (configuration.server.restartOnFailure) {
          const isScheduler = worker.process.pid === AppService.schedulerPID
          AppService.logger.log(`[Worker:${worker.process.pid}] restarting ${isScheduler ? `(with Scheduler)` : ''}...`)
          AppService.forkProcess(isScheduler)
        }
      })
    } else {
      AppService.logger.log(`[Worker:${process.pid}] started`)
      bootstrap().catch(() => process.exit(1))
    }
  }

  private static registerShutdownHooks(): void {
    if (AppService.shutdownHooksRegistered) return
    AppService.shutdownHooksRegistered = true
    for (const signal of ['SIGINT', 'SIGTERM'] satisfies NodeJS.Signals[]) {
      process.on(signal, () => AppService.shutdown(signal))
    }
  }

  private static shutdown(signal: NodeJS.Signals): void {
    if (AppService.shuttingDown) return
    AppService.shuttingDown = true
    AppService.logger.log(`[Master:${process.pid}] shutting down`)
    const workers = Object.values(cluster.workers ?? {}).filter((worker): worker is Worker => !!worker)
    if (!workers.length) {
      process.exit(0)
    }
    // Let workers close Socket.IO and HTTP while their IPC channel to the primary is still open.
    for (const worker of workers) {
      if (!worker.isDead()) {
        worker.process.kill(signal)
      }
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
