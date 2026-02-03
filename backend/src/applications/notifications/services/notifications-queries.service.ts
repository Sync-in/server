import { Inject, Injectable } from '@nestjs/common'
import { and, desc, eq, inArray, SelectedFields, SQL } from 'drizzle-orm'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import { DBSchema } from '../../../infrastructure/database/interfaces/database.interface'
import { dbCheckAffectedRows } from '../../../infrastructure/database/utils'
import { USER_NOTIFICATION } from '../../users/constants/user'
import { userFullNameSQL, users } from '../../users/schemas/users.schema'
import type { NotificationContent, NotificationFromUser } from '../interfaces/notification-properties.interface'
import type { UserMailNotification } from '../interfaces/user-mail-notification.interface'
import { Notification } from '../schemas/notification.interface'
import { notifications } from '../schemas/notifications.schema'

@Injectable()
export class NotificationsQueries {
  constructor(@Inject(DB_TOKEN_PROVIDER) private readonly db: DBSchema) {}

  list(userId: number, onlyUnread: boolean = false): Promise<NotificationFromUser[]> {
    const where: SQL[] = [eq(notifications.toUserId, userId), ...(onlyUnread ? [eq(notifications.wasRead, false)] : [])]
    return this.db
      .select({
        id: notifications.id,
        fromUser: { id: users.id, login: users.login, email: users.email, fullName: userFullNameSQL(users) },
        content: notifications.content,
        wasRead: notifications.wasRead,
        createdAt: notifications.createdAt
      } satisfies NotificationFromUser | SelectedFields<any, any>)
      .from(notifications)
      .leftJoin(users, eq(users.id, notifications.fromUserId))
      .where(and(...where))
      .orderBy(desc(notifications.id))
  }

  async create(fromUserId: number, toUserIds: number[], content: NotificationContent): Promise<void> {
    dbCheckAffectedRows(
      await this.db.insert(notifications).values(
        toUserIds.map((toUserId: number) => ({
          fromUserId: fromUserId,
          toUserId: toUserId,
          content: content
        }))
      ),
      toUserIds.length
    )
  }

  async wasRead(userId: number, notificationId: number): Promise<void> {
    await this.db
      .update(notifications)
      .set({ wasRead: true } as Notification)
      .where(and(eq(notifications.toUserId, userId), eq(notifications.id, notificationId), eq(notifications.wasRead, false)))
  }

  async delete(userId: number, notificationId?: number): Promise<void> {
    const where: SQL[] = [eq(notifications.toUserId, userId), ...(notificationId ? [eq(notifications.id, notificationId)] : [])]
    await this.db.delete(notifications).where(and(...where))
  }

  usersNotifiedByEmail(userIds: number[]): Promise<UserMailNotification[]> {
    return this.db
      .select({
        id: users.id,
        email: users.email,
        language: users.language,
        notification: users.notification
      } satisfies UserMailNotification | SelectedFields<any, any>)
      .from(users)
      .where(and(inArray(users.id, userIds), eq(users.notification, USER_NOTIFICATION.APPLICATION_EMAIL)))
  }
}
