import { applyDecorators, UseGuards } from '@nestjs/common'
import { SpaceGuard } from '../../spaces/guards/space.guard.js'
import { USER_PERMISSION } from '../../users/constants/user.js'
import { UserHavePermission } from '../../users/decorators/permissions.decorator.js'
import { UserPermissionsGuard } from '../../users/guards/permissions.guard.js'
import { SyncContext } from './sync-context.decorator.js'

export const SyncEnvironment = () => {
  return applyDecorators(UserHavePermission(USER_PERMISSION.DESKTOP_APP_SYNC), SyncContext(), UseGuards(UserPermissionsGuard, SpaceGuard))
}
