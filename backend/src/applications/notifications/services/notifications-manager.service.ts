/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Injectable, Logger } from '@nestjs/common'
import { MailProps } from '../../../infrastructure/mailer/interfaces/mail.interface'
import { Mailer } from '../../../infrastructure/mailer/mailer.service'
import { USER_NOTIFICATION } from '../../users/constants/user'
import { UserModel } from '../../users/models/user.model'
import { getAvatarBase64 } from '../../users/utils/avatar'
import { NOTIFICATION_APP } from '../constants/notifications'
import { NOTIFICATIONS_WS } from '../constants/websocket'
import type { NotificationContent, NotificationFromUser, NotificationOptions } from '../interfaces/notification-properties.interface'
import type { UserMailNotification } from '../interfaces/user-mail-notification'
import { auth2FaMail, authLocked, commentMail, linkMail, shareMail, spaceMail, spaceRootMail, syncMail } from '../mails/models'
import { WebSocketNotifications } from '../notifications.gateway'
import { NotificationsQueries } from './notifications-queries.service'

@Injectable()
export class NotificationsManager {
  private readonly logger = new Logger(NotificationsManager.name)

  constructor(
    private readonly mailer: Mailer,
    private readonly notificationsQueries: NotificationsQueries,
    private readonly webSocketNotifications: WebSocketNotifications
  ) {}

  list(user: UserModel, onlyUnread: boolean = false): Promise<NotificationFromUser[]> {
    return this.notificationsQueries.list(user.id, onlyUnread)
  }

  async create(toUsers: UserMailNotification[] | number[], content: NotificationContent, options?: NotificationOptions): Promise<void> {
    // store it in db
    const isArrayOfUsers: boolean = typeof toUsers[0] === 'object'
    const toUserIds = isArrayOfUsers ? (toUsers as UserMailNotification[]).map((m) => m.id) : (toUsers as number[])
    this.storeNotification(toUserIds, content, options?.author?.id).catch((e: Error) => this.logger.error(`${this.create.name} - ${e}`))

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
      this.sendEmailNotification(usersNotifiedByEmail, content, options).catch((e: Error) => this.logger.error(`${this.create.name} - ${e}`))
    }
  }

  wasRead(user: UserModel, notificationId?: number): void {
    this.notificationsQueries.wasRead(user.id, notificationId).catch((e: Error) => this.logger.error(`${this.wasRead.name} - ${e}`))
  }

  async delete(user: UserModel, notificationId?: number): Promise<void> {
    return this.notificationsQueries.delete(user.id, notificationId)
  }

  async sendEmailNotification(toUsers: UserMailNotification[], content: NotificationContent, options?: NotificationOptions): Promise<void> {
    if (!this.mailer.available) {
      return
    }
    if (options?.author) {
      options.author.avatarBase64 = await getAvatarBase64(options.author.login)
    }
    this.mailer
      .sendMails(
        await Promise.all(
          toUsers.map(async (m) => {
            const [title, html] = this.genMail(m.language, content, options)
            return {
              to: m.email,
              subject: title,
              html: html
            } satisfies MailProps
          })
        )
      )
      .catch((e: Error) => this.logger.error(`${this.sendEmailNotification.name} - ${e}`))
  }

  private async storeNotification(toUserIds: number[], content: NotificationContent, authorId?: number): Promise<void> {
    // store it in db
    try {
      await this.notificationsQueries.create(authorId || null, toUserIds, content)
    } catch (e) {
      this.logger.error(`${this.create.name} - ${e}`)
    }
  }

  private genMail(language: string, content: NotificationContent, options?: NotificationOptions): [string, string] {
    switch (content.app) {
      case NOTIFICATION_APP.COMMENTS:
        return commentMail(language, content, { content: options.content, currentUrl: options.currentUrl, author: options.author })
      case NOTIFICATION_APP.SPACES:
        return spaceMail(language, content, { currentUrl: options.currentUrl, action: options.action })
      case NOTIFICATION_APP.SPACE_ROOTS:
        return spaceRootMail(language, content, { currentUrl: options.currentUrl, author: options.author, action: options.action })
      case NOTIFICATION_APP.SHARES:
        return shareMail(language, content, { currentUrl: options.currentUrl, author: options.author, action: options.action })
      case NOTIFICATION_APP.LINKS:
        return linkMail(language, content, {
          currentUrl: options.currentUrl,
          author: options.author,
          linkUUID: options.linkUUID,
          linkPassword: options.linkPassword,
          action: options.action
        })
      case NOTIFICATION_APP.SYNC:
        return syncMail(language, content, { currentUrl: options.currentUrl, action: options.action })
      case NOTIFICATION_APP.AUTH_2FA:
        return auth2FaMail(language, content)
      case NOTIFICATION_APP.AUTH_LOCKED:
        return authLocked(language, content)
      default:
        this.logger.error(`${this.genMail.name} - case not handled : ${content.app}`)
    }
  }
}
