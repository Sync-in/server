import { Global, Module } from '@nestjs/common'
import { NotificationsModule } from '../notifications/notifications.module.js'
import { AdminUsersController } from './admin-users.controller.js'
import { UserPermissionsGuard } from './guards/permissions.guard.js'
import { UserRolesGuard } from './guards/roles.guard.js'
import { AdminUsersManager } from './services/admin-users-manager.service.js'
import { AdminUsersQueries } from './services/admin-users-queries.service.js'
import { UsersManager } from './services/users-manager.service.js'
import { UsersQueries } from './services/users-queries.service.js'
import { UsersController } from './users.controller.js'
import { WebSocketUsers } from './users.gateway.js'

@Global()
@Module({
  imports: [NotificationsModule],
  controllers: [UsersController, AdminUsersController],
  providers: [WebSocketUsers, UserRolesGuard, UserPermissionsGuard, UsersManager, UsersQueries, AdminUsersManager, AdminUsersQueries],
  exports: [UsersManager, UsersQueries, AdminUsersManager, AdminUsersQueries]
})
export class UsersModule {}
