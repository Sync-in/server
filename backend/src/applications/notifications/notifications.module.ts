import { Module } from '@nestjs/common'
import { NotificationsController } from './notifications.controller'
import { WebSocketNotifications } from './notifications.gateway'
import { NotificationsManager } from './services/notifications-manager.service'
import { NotificationsQueries } from './services/notifications-queries.service'

@Module({
  controllers: [NotificationsController],
  providers: [WebSocketNotifications, NotificationsManager, NotificationsQueries],
  exports: [NotificationsManager]
})
export class NotificationsModule {}
