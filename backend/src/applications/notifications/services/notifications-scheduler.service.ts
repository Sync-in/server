import { toErrorMessage } from '../../../common/errors.js'
import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { NotificationsQueries } from './notifications-queries.service.js'

@Injectable()
export class NotificationsScheduler {
  private readonly logger = new Logger(NotificationsScheduler.name)

  constructor(private readonly notificationsQueries: NotificationsQueries) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async deleteExpiredNotifications(): Promise<void> {
    try {
      const deletedNotifications = await this.notificationsQueries.deleteExpired()
      this.logger.log({ tag: this.deleteExpiredNotifications.name, msg: `${deletedNotifications} expired notification(s) deleted` })
    } catch (e) {
      this.logger.error({ tag: this.deleteExpiredNotifications.name, msg: toErrorMessage(e) })
    }
  }
}
