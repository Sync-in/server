import { intersectPermissions } from '../../../common/shared'
import { USER_PERMISSION } from '../../users/constants/user'
import type { UserModel } from '../../users/models/user.model'
import { SPACE_ALIAS, SPACE_OPERATION, SPACE_PERMS_SEP, SPACE_REPOSITORY } from '../constants/spaces'
import type { SpaceEnv } from '../models/space-env.model'
import type { SpaceProps } from '../models/space-props.model'
import type { SpaceRoot } from '../schemas/space-root.interface'

export function havePermission(currentPermissions: string, mustHavePermission: SPACE_OPERATION): boolean {
  return currentPermissions.indexOf(mustHavePermission) > -1
}

export function haveSpaceEnvPermissions(space: SpaceEnv, permission: SPACE_OPERATION): boolean {
  if (permission) {
    return havePermission(space.envPermissions, permission)
  }
  return true
}

export function haveSpacePermission(space: Partial<SpaceProps>, permission: SPACE_OPERATION): boolean {
  return havePermission(space.permissions, permission)
}

export function getEnvPermissions(space: SpaceEnv, root: Partial<SpaceRoot>): string {
  /* In a root space, we have to intersect the space & the root permissions */
  if (root?.id && typeof root?.permissions === 'string') {
    return intersectPermissions(space.permissions, root.permissions)
  } else {
    return space.permissions
  }
}

export function removePermissions(permissions: string, rmPermissions: SPACE_OPERATION[]): string {
  return permissions
    .split(SPACE_PERMS_SEP)
    .filter((p: SPACE_OPERATION) => rmPermissions.indexOf(p) === -1)
    .sort()
    .join(SPACE_PERMS_SEP)
}

export function canAccessToSpaceUrl(user: UserModel, urlSegments: string[]): boolean {
  if (urlSegments[1] === SPACE_ALIAS.PERSONAL && (urlSegments[0] === SPACE_REPOSITORY.FILES || urlSegments[0] === SPACE_REPOSITORY.TRASH)) {
    return user.havePermission(USER_PERMISSION.PERSONAL_SPACE)
  } else if (urlSegments[0] === SPACE_REPOSITORY.FILES) {
    return user.havePermission(USER_PERMISSION.SPACES)
  } else if (urlSegments[0] === SPACE_REPOSITORY.SHARES) {
    return user.havePermission(USER_PERMISSION.SHARES)
  } else if (urlSegments[0] === SPACE_REPOSITORY.TRASH) {
    return user.havePermission(USER_PERMISSION.SPACES) || user.havePermission(USER_PERMISSION.PERSONAL_SPACE)
  }
  return false
}

export function canAccessToSpace(user: UserModel, space: SpaceEnv): boolean {
  if (space.inPersonalSpace) {
    return user.havePermission(USER_PERMISSION.PERSONAL_SPACE)
  } else if (space.inFilesRepository) {
    return user.havePermission(USER_PERMISSION.SPACES)
  } else if (space.inSharesRepository) {
    return user.havePermission(USER_PERMISSION.SHARES)
  } else if (space.inTrashRepository) {
    return user.havePermission(USER_PERMISSION.SPACES) || user.havePermission(USER_PERMISSION.PERSONAL_SPACE)
  }
  return false
}
