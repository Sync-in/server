/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

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

  @Timeout(60000)
  @Cron(CronExpression.EVERY_HOUR)
  async updateQuotas() {
    this.logger.log('Update Personal Quotas - START')
    try {
      await this.spacesManager.updatePersonalSpacesQuota()
    } catch (e) {
      this.logger.error(`Update Personal Quotas} - ${e}`)
    }
    this.logger.log('Update Personal Quotas - END')
    this.logger.log('Update Space Quotas - START')
    try {
      await this.spacesManager.updateSpacesQuota()
    } catch (e) {
      this.logger.error(`Update Space Quotas - ${e}`)
    }
    this.logger.log('Update Space Quotas - END')
    this.logger.log('Update Share External Path Quotas - START')
    try {
      await this.sharesManager.updateSharesExternalPathQuota()
    } catch (e) {
      this.logger.error(`Update Share External Path Quotas - ${e}`)
    }
    this.logger.log('Update Share External Path Quotas - END')
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async deleteExpiredSpaces() {
    /* Removes spaces that have been disabled for more than 30 days */
    this.logger.log(`${this.deleteExpiredSpaces.name} - START`)
    try {
      await this.spacesManager.deleteExpiredSpaces()
    } catch (e) {
      this.logger.error(`${this.deleteExpiredSpaces.name} - ${e}`)
    }
    this.logger.log(`${this.deleteExpiredSpaces.name} - DONE`)
  }
}
