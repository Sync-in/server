import { toErrorMessage } from '../../../common/errors.js'
import { Injectable, Logger } from '@nestjs/common'
import { i18nLocale } from '../../../common/i18n.js'
import { configuration } from '../../../configuration/config.environment.js'
import { MailProps } from '../../../infrastructure/mailer/interfaces/mail.interface.js'
import { Mailer } from '../../../infrastructure/mailer/mailer.service.js'
import { USER_NOTIFICATION } from '../../users/constants/user.js'
import { UserModel } from '../../users/models/user.model.js'
import { getAvatarBase64 } from '../../users/utils/avatar.js'
import { NOTIFICATION_APP } from '../constants/notifications.js'
import { NOTIFICATIONS_WS } from '../constants/websocket.js'
import type {
  NotificationArguments,
  NotificationContent,
  NotificationFromUser,
  NotificationMail
} from '../interfaces/notification-properties.interface.js'
import type { UserMailNotification } from '../interfaces/user-mail-notification.interface.js'
import {
  auth2FaMail,
  authLockedMail,
  commentMail,
  linkMail,
  requestUnlockMail,
  serverUpdateAvailableMail,
  shareMail,
  spaceMail,
  spaceRootMail,
  syncMail
} from '../mails/models.js'
import { WebSocketNotifications } from '../notifications.gateway.js'
import { NotificationsQueries } from './notifications-queries.service.js'

@Injectable()
export class NotificationsManager {
  private readonly logger = new Logger(NotificationsManager.name)
  private readonly publicUrl = configuration.server.publicUrl ?? undefined

  constructor(
    private readonly mailer: Mailer,
    private readonly notificationsQueries: NotificationsQueries,
    private readonly webSocketNotifications: WebSocketNotifications
  ) {
    if (this.mailer.available && !this.publicUrl) {
      this.logger.warn('Notification email action links are disabled because server.publicUrl is not configured.')
    }
  }

  list(user: UserModel, onlyUnread: boolean = false): Promise<NotificationFromUser[]> {
    return this.notificationsQueries.list(user.id, onlyUnread)
  }

  async create(toUsers: UserMailNotification[] | number[], ...notification: NotificationArguments): Promise<void> {
    const [content, options] = notification
    // store it in db
    const isArrayOfUsers: boolean = typeof toUsers[0] === 'object'
    const toUserIds = isArrayOfUsers ? (toUsers as UserMailNotification[]).map((m) => m.id) : (toUsers as number[])
    this.storeNotification(toUserIds, content, options?.author?.id).catch((e: Error) =>
      this.logger.error({ tag: this.create.name, msg: toErrorMessage(e) })
    )

    // send websocket notification
    this.webSocketNotifications.sendMessageToUsers(toUserIds, NOTIFICATIONS_WS.EVENTS.NOTIFICATION, 'check')

    // send emails
    if (this.mailer.available) {
      const usersNotifiedByEmail: UserMailNotification[] = isArrayOfUsers
        ? (toUsers as UserMailNotification[]).filter((u) => u.notification === USER_NOTIFICATION.APPLICATION_EMAIL)
        : await this.notificationsQueries.usersNotifiedByEmail(toUsers as number[])
      if (!usersNotifiedByEmail.length) {
        return
      }
      this.sendEmailNotification(usersNotifiedByEmail, ...notification).catch((e: Error) =>
        this.logger.error({ tag: this.create.name, msg: toErrorMessage(e) })
      )
    }
  }

  wasRead(user: UserModel, notificationId: number): void {
    this.notificationsQueries
      .wasRead(user.id, notificationId)
      .catch((e: Error) => this.logger.error({ tag: this.wasRead.name, msg: toErrorMessage(e) }))
  }

  async delete(user: UserModel, notificationId?: number): Promise<void> {
    return this.notificationsQueries.delete(user.id, notificationId)
  }

  async sendEmailNotification(toUsers: UserMailNotification[], ...notification: NotificationArguments): Promise<void> {
    if (!this.mailer.available) {
      return
    }
    const [, options] = notification
    if (options?.author) {
      options.author.avatarBase64 = await getAvatarBase64(options.author.login)
    }
    this.mailer
      .sendMails(
        toUsers.map((m) => {
          const [title, html] = this.genMail(m.language as i18nLocale, ...notification)!
          return {
            to: m.email,
            subject: title,
            html: html
          } satisfies MailProps
        })
      )
      .catch((e: Error) => this.logger.error({ tag: this.sendEmailNotification.name, msg: toErrorMessage(e) }))
  }

  private async storeNotification(toUserIds: number[], content: NotificationContent, authorId?: number): Promise<void> {
    // store it in db
    try {
      await this.notificationsQueries.create(authorId || null, toUserIds, content)
    } catch (e) {
      this.logger.error({ tag: this.storeNotification.name, msg: toErrorMessage(e) })
    }
  }

  private genMail(language: i18nLocale, ...[content, options]: NotificationArguments): [string, string] | undefined {
    // The argument tuple enforces the correlation; grouping it lets the switch narrow the options too.
    const notification = { ...content, options } as NotificationMail
    switch (notification.app) {
      case NOTIFICATION_APP.COMMENTS:
        return commentMail(language, notification, {
          content: notification.options.content,
          publicUrl: this.publicUrl,
          author: notification.options.author
        })
      case NOTIFICATION_APP.SPACES:
        return spaceMail(language, notification, { publicUrl: this.publicUrl, action: notification.options.action })
      case NOTIFICATION_APP.SPACE_ROOTS:
        return spaceRootMail(language, notification, {
          publicUrl: this.publicUrl,
          author: notification.options.author,
          action: notification.options.action
        })
      case NOTIFICATION_APP.SHARES:
        return shareMail(language, notification, {
          publicUrl: this.publicUrl,
          author: notification.options.author,
          action: notification.options.action
        })
      case NOTIFICATION_APP.LINKS:
        return linkMail(language, notification, {
          publicUrl: this.publicUrl,
          author: notification.options.author,
          linkUUID: notification.options.linkUUID,
          linkPassword: notification.options.linkPassword,
          action: notification.options.action
        })
      case NOTIFICATION_APP.SYNC:
        return syncMail(language, notification, { publicUrl: this.publicUrl, action: notification.options.action })
      case NOTIFICATION_APP.AUTH_2FA:
        return auth2FaMail(language, notification)
      case NOTIFICATION_APP.AUTH_LOCKED:
        return authLockedMail(language, notification)
      case NOTIFICATION_APP.UNLOCK_REQUEST:
        return requestUnlockMail(language, notification, {
          publicUrl: this.publicUrl,
          author: notification.options.author
        })
      case NOTIFICATION_APP.UPDATE_AVAILABLE:
        return serverUpdateAvailableMail(language, notification)
      default:
        this.logger.error({ tag: this.genMail.name, msg: `case not handled: ${JSON.stringify(content)}` })
    }
  }
}
