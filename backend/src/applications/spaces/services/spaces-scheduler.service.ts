import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { SpacesManager } from './spaces-manager.service'

@Injectable()
export class SpacesScheduler {
  private readonly logger = new Logger(SpacesScheduler.name)

  constructor(private readonly spacesManager: SpacesManager) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async deleteExpiredSpaces() {
    /* Removes spaces that have been disabled for more than 30 days */
    this.logger.log({ tag: this.deleteExpiredSpaces.name, msg: `START` })
    try {
      await this.spacesManager.deleteExpiredSpaces()
    } catch (e) {
      this.logger.error({ tag: this.deleteExpiredSpaces.name, msg: `${e}` })
    }
    this.logger.log({ tag: this.deleteExpiredSpaces.name, msg: `DONE` })
  }
}
