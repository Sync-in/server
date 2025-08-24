/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PinoLogger } from 'nestjs-pino'
import nodemailer from 'nodemailer'
import type { Logger as NodeMailLogger } from 'nodemailer/lib/shared'
import { MailDefaultsTransport, MailProps, MailTransport } from './interfaces/mail.interface'
import { MailerConfig } from './mailer.config'

@Injectable()
export class Mailer {
  public available: boolean = false
  private readonly transporter: nodemailer.Transporter
  private readonly configuration: MailerConfig

  constructor(
    private configService: ConfigService,
    private readonly logger: PinoLogger
  ) {
    this.logger.setContext(Mailer.name.toUpperCase())
    this.configuration = this.configService.get<MailerConfig>('mail')
    if (!this.configuration) {
      return
    }
    this.logger.logger.level = this.configuration.debug ? 'debug' : 'info'
    if (this.configuration.secure && (this.configuration.port === 587 || this.configuration.port === 25)) {
      this.logger.warn(`Secure transport has been disabled due to use of port : ${this.configuration.port}`)
      this.configuration.secure = false
    }
    this.transporter = nodemailer.createTransport(
      {
        host: this.configuration.host,
        port: this.configuration.port,
        auth: this.configuration.auth,
        secure: this.configuration.secure,
        logger: this.configuration.logger ? (this.logger as NodeMailLogger & any) : false
      } satisfies MailTransport,
      { from: this.configuration.sender, tls: { rejectUnauthorized: false } } satisfies MailDefaultsTransport
    )
    this.verify().catch(this.logger.error)
  }

  async sendMails(mails: MailProps[]) {
    if (!this.available) {
      return
    }
    for (const m of mails) {
      this.transporter
        .sendMail(m)
        .then(() => {
          this.logger.info(`Mail sent to '${m.to}' with subject '${m.subject}'`)
        })
        .catch((e) => {
          this.logger.error(`Mail was not sent to '${m.to}' with subject '${m.subject}' : ${e}`)
        })
    }
  }

  private async verify(): Promise<void> {
    try {
      await this.transporter.verify()
      this.logger.info(`Using Mail Server at ${this.configuration.host}:${this.configuration.port} (secure: ${this.configuration.secure})`)
      this.available = true
    } catch (e) {
      this.logger.error(
        `Unable to use Mail Server at ${this.configuration.host}:${this.configuration.port} (secure: ${this.configuration.secure}) : ${e}`
      )
      this.available = false
    }
  }
}
