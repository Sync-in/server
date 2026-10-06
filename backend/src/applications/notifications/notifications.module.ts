import { Module } from '@nestjs/common'
import { NotificationsController } from './notifications.controller.js'
import { WebSocketNotifications } from './notifications.gateway.js'
import { NotificationsManager } from './services/notifications-manager.service.js'
import { NotificationsQueries } from './services/notifications-queries.service.js'

@Module({
  controllers: [NotificationsController],
  providers: [WebSocketNotifications, NotificationsManager, NotificationsQueries],
  exports: [NotificationsManager]
})
export class NotificationsModule {}
