import { Injectable, type OnModuleInit } from '@nestjs/common'
import { PinoLogger } from 'nestjs-pino'
import type { SendMailOptions, SMTPTransportOptions, Transporter } from 'nodemailer'
import { configuration } from '../../configuration/config.environment.js'
import type { MailProps } from './interfaces/mail.interface.js'
import { MailerConfig } from './mailer.config.js'

@Injectable()
export class Mailer implements OnModuleInit {
  public available: boolean = false
  private transporter: Transporter
  private readonly configuration: MailerConfig

  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(Mailer.name.toUpperCase())
    this.configuration = configuration.mail
  }

  async onModuleInit(): Promise<void> {
    if (!this.configuration) {
      return
    }
    const { default: nodemailer } = await import('nodemailer')
    if (this.configuration.secure && (this.configuration.port === 587 || this.configuration.port === 25)) {
      this.logger.warn(`Secure transport has been disabled due to use of port : ${this.configuration.port}`)
      this.configuration.secure = false
    }
    const smtpLoggerEnabled = this.configuration.logger === true
    this.transporter = nodemailer.createTransport(
      {
        host: this.configuration.host,
        port: this.configuration.port,
        auth: this.configuration.auth,
        secure: this.configuration.secure,
        ignoreTLS: this.configuration.ignoreTLS,
        tls: { rejectUnauthorized: this.configuration.rejectUnauthorized },
        debug: smtpLoggerEnabled && this.logger.logger.isLevelEnabled('debug'),
        logger: smtpLoggerEnabled ? (this.logger as SMTPTransportOptions['logger']) : false
      } satisfies SMTPTransportOptions,
      { from: this.configuration.sender } satisfies SendMailOptions
    )
    await this.verify()
  }

  async sendMails(mails: MailProps[]): Promise<void> {
    if (!this.available) {
      return
    }

    await Promise.all(
      mails.map(async (m) => {
        try {
          await this.transporter.sendMail(m)
          this.logger.info(`Mail sent to '${m.to}' with subject '${m.subject}'`)
        } catch (e) {
          this.logger.error(`Mail was not sent to '${m.to}' with subject '${m.subject}' : ${e}`)
        }
      })
    )
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
