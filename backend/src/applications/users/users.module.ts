/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Global, Module } from '@nestjs/common'
import { AdminUsersController } from './admin-users.controller'
import { UserPermissionsGuard } from './guards/permissions.guard'
import { UserRolesGuard } from './guards/roles.guard'
import { AdminUsersManager } from './services/admin-users-manager.service'
import { AdminUsersQueries } from './services/admin-users-queries.service'
import { UsersManager } from './services/users-manager.service'
import { UsersQueries } from './services/users-queries.service'
import { UsersController } from './users.controller'
import { WebSocketUsers } from './users.gateway'

@Global()
@Module({
  controllers: [UsersController, AdminUsersController],
  providers: [WebSocketUsers, UserRolesGuard, UserPermissionsGuard, UsersManager, UsersQueries, AdminUsersManager, AdminUsersQueries],
  exports: [UsersManager, UsersQueries, AdminUsersManager, AdminUsersQueries]
})
export class UsersModule {}
