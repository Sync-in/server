import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common'
import { SchedulerRegistry } from '@nestjs/schedule'
import { CronJob, type CronJobParams } from 'cron'
import { INFRASTRUCTURE_DEPENDENCY } from '../availability/availability.constants'
import { Availability } from '../availability/availability.service'
import { IS_SCHEDULER_PROCESS } from './scheduler.constants'

@Injectable()
export class SchedulerManager implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerManager.name)
  readonly isSchedulerProcess = IS_SCHEDULER_PROCESS
  private readonly pausedCronJobs = new Set<string>()
  private running = false
  private unsubscribeAvailability?: () => void

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly availability: Availability
  ) {}

  onApplicationBootstrap(): void {
    if (!this.isSchedulerProcess) return
    if (this.dependenciesAvailable()) {
      this.resume()
    } else {
      this.pause()
    }
    this.unsubscribeAvailability = this.availability.onChange(() => this.synchronize())
  }

  onModuleDestroy(): void {
    this.unsubscribeAvailability?.()
  }

  registerCron(name: string, cronTime: CronJobParams['cronTime'], callback: () => void | Promise<void>): void {
    if (!this.isSchedulerProcess) return
    const job = CronJob.from({ cronTime, onTick: callback, start: false, name })
    this.schedulerRegistry.addCronJob(name, job)
    if (this.running) {
      job.start()
    } else {
      // Dynamic jobs registered during bootstrap or an outage start with the other paused jobs.
      this.pausedCronJobs.add(name)
    }
  }

  unregisterCron(name: string): void {
    this.pausedCronJobs.delete(name)
    if (this.schedulerRegistry.doesExist('cron', name)) {
      this.schedulerRegistry.deleteCronJob(name)
    }
  }

  private synchronize(): void {
    const shouldRun = this.dependenciesAvailable()
    if (shouldRun === this.running) return
    if (shouldRun) {
      this.resume()
    } else {
      this.pause()
    }
  }

  private dependenciesAvailable(): boolean {
    return this.availability.isAvailable(INFRASTRUCTURE_DEPENDENCY.DATABASE) && this.availability.isAvailable(INFRASTRUCTURE_DEPENDENCY.CACHE)
  }

  private pause(): void {
    let pausedCronJobs = 0
    // Remember only active jobs so recovery does not enable jobs that were already stopped.
    for (const [name, job] of this.schedulerRegistry.getCronJobs()) {
      if (job.isActive) {
        job.stop()
        this.pausedCronJobs.add(name)
        pausedCronJobs++
      }
    }
    // Clearing registered handles cancels pending timeouts and removes handles for completed ones.
    const registeredTimeouts = this.schedulerRegistry.getTimeouts()
    for (const name of registeredTimeouts) {
      this.schedulerRegistry.deleteTimeout(name)
    }
    this.running = false
    this.logger.warn(
      `Scheduler paused: required service unavailable (${pausedCronJobs} cron job(s) paused, ${registeredTimeouts.length} timeout registration(s) cleared)`
    )
  }

  private resume(): void {
    let resumedCronJobs = 0
    for (const name of [...this.pausedCronJobs]) {
      if (!this.schedulerRegistry.doesExist('cron', name)) {
        this.pausedCronJobs.delete(name)
        continue
      }
      const job = this.schedulerRegistry.getCronJob(name)
      if (!job.isActive) {
        job.start()
        resumedCronJobs++
      }
      this.pausedCronJobs.delete(name)
    }
    this.running = true
    this.logger.log(`Scheduler running: required services available (${resumedCronJobs} cron job(s) started or resumed)`)
  }
}
