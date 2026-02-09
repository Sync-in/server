import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression, Timeout } from '@nestjs/schedule'
import { SharesManager } from '../../shares/services/shares-manager.service'
import { SpacesManager } from './spaces-manager.service'

@Injectable()
export class SpacesScheduler {
  private readonly logger = new Logger(SpacesScheduler.name)

  constructor(
    private readonly spacesManager: SpacesManager,
    private readonly sharesManager: SharesManager
  ) {}

  @Timeout(60_000)
  async onStartup() {
    await this.updateQuotas()
  }

  @Cron(CronExpression.EVERY_HOUR)
  async updateQuotas() {
    this.logger.log({ tag: this.updateQuotas.name, msg: 'Personals - START' })
    try {
      await this.spacesManager.updatePersonalSpacesQuota()
    } catch (e) {
      this.logger.error({ tag: this.updateQuotas.name, msg: `Personals} - ${e}` })
    }
    this.logger.log({ tag: this.updateQuotas.name, msg: 'Personals - END' })
    this.logger.log({ tag: this.updateQuotas.name, msg: 'Spaces - START' })
    try {
      await this.spacesManager.updateSpacesQuota()
    } catch (e) {
      this.logger.error({ tag: this.updateQuotas.name, msg: `Spaces - ${e}` })
    }
    this.logger.log({ tag: this.updateQuotas.name, msg: 'Spaces - END' })
    this.logger.log({ tag: this.updateQuotas.name, msg: 'Share External Paths - START' })
    try {
      await this.sharesManager.updateSharesExternalPathQuota()
    } catch (e) {
      this.logger.error({ tag: this.updateQuotas.name, msg: `Share External Paths - ${e}` })
    }
    this.logger.log({ tag: this.updateQuotas.name, msg: 'Share External Paths - END' })
  }

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
