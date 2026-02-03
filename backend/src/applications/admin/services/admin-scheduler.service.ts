import { Injectable } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { setTimeout } from 'node:timers/promises'
import { AdminService } from './admin.service'

@Injectable()
export class AdminSchedulerService {
  constructor(private readonly adminService: AdminService) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async checkServerUpdateAndNotify() {
    // Apply a random delay so instances don't trigger the check simultaneously
    const randomDelay = Math.floor(Math.random() * 900 * 1000)
    await setTimeout(randomDelay)
    await this.adminService.checkServerUpdateAndNotify()
  }
}
