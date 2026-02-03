import { Controller, Delete, Get, Param, ParseIntPipe, Patch } from '@nestjs/common'
import { GetUser } from '../users/decorators/user.decorator'
import type { UserModel } from '../users/models/user.model'
import { NOTIFICATIONS_ROUTE } from './constants/routes'
import type { NotificationFromUser } from './interfaces/notification-properties.interface'
import { NotificationsManager } from './services/notifications-manager.service'

@Controller(NOTIFICATIONS_ROUTE.BASE)
export class NotificationsController {
  constructor(private readonly notificationsManager: NotificationsManager) {}

  @Get()
  list(@GetUser() user: UserModel): Promise<NotificationFromUser[]> {
    return this.notificationsManager.list(user)
  }

  @Get(NOTIFICATIONS_ROUTE.UNREAD)
  listUnread(@GetUser() user: UserModel): Promise<NotificationFromUser[]> {
    return this.notificationsManager.list(user, true)
  }

  @Patch(':id')
  wasRead(@GetUser() user: UserModel, @Param('id', ParseIntPipe) notificationId: number): void {
    return this.notificationsManager.wasRead(user, notificationId)
  }

  @Delete()
  deleteAll(@GetUser() user: UserModel): Promise<void> {
    return this.notificationsManager.delete(user)
  }

  @Delete(':id')
  delete(@GetUser() user: UserModel, @Param('id', ParseIntPipe) notificationId: number): Promise<void> {
    return this.notificationsManager.delete(user, notificationId)
  }
}
