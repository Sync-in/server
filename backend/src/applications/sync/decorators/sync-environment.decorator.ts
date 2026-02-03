import { applyDecorators, UseGuards } from '@nestjs/common'
import { SpaceGuard } from '../../spaces/guards/space.guard'
import { USER_PERMISSION } from '../../users/constants/user'
import { UserHavePermission } from '../../users/decorators/permissions.decorator'
import { UserPermissionsGuard } from '../../users/guards/permissions.guard'
import { SyncContext } from './sync-context.decorator'

export const SyncEnvironment = () => {
  return applyDecorators(UserHavePermission(USER_PERMISSION.DESKTOP_APP_SYNC), SyncContext(), UseGuards(UserPermissionsGuard, SpaceGuard))
}
