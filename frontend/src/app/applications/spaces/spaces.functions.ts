import { SPACE_OPERATION, SPACE_PERMS_SEP } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import { SPACES_PERMISSIONS_MODEL, SPACES_PERMISSIONS_TEXT } from './spaces.constants'

export function setBooleanPermissions(permissions: string, omitPermissions: SPACE_OPERATION[] = []): Partial<Record<`${SPACE_OPERATION}`, boolean>> {
  const hPerms: Partial<Record<SPACE_OPERATION, boolean>> = {
    ...Object.fromEntries(Object.entries(SPACES_PERMISSIONS_MODEL).filter(([p, _v]) => omitPermissions.indexOf(p as SPACE_OPERATION) === -1))
  }
  if (!permissions) return hPerms
  for (const perm of permissions.split(SPACE_PERMS_SEP)) {
    if (perm in hPerms) {
      hPerms[perm] = true
    }
  }
  return hPerms
}

export function setAllowedBooleanPermissions(
  allowedPermissions: string,
  currentPermissions: string,
  omitPermissions: SPACE_OPERATION[] = []
): Partial<Record<`${SPACE_OPERATION}`, boolean>> {
  const hPerms: Partial<Record<`${SPACE_OPERATION}`, boolean>> = {}
  if (!allowedPermissions) return hPerms
  for (const perm of allowedPermissions.split(SPACE_PERMS_SEP)) {
    if (omitPermissions.indexOf(perm as SPACE_OPERATION) === -1) {
      hPerms[perm] = currentPermissions.indexOf(perm) > -1
    }
  }
  return hPerms
}

export function setTextIconPermissions(permissions: string, omitPermissions: SPACE_OPERATION[] = []): Partial<typeof SPACES_PERMISSIONS_TEXT> {
  const hPerms = {}
  if (!permissions) return hPerms
  for (const perm of permissions.split(SPACE_PERMS_SEP)) {
    if (omitPermissions.indexOf(perm as SPACE_OPERATION) === -1) {
      hPerms[perm] = SPACES_PERMISSIONS_TEXT[perm]
    }
  }
  return hPerms
}

export function setStringPermission(permissions: Partial<Record<`${SPACE_OPERATION}`, boolean>>): string {
  return Object.entries(permissions)
    .filter(([_k, v]) => v)
    .map(([k, _v]) => k)
    .join(SPACE_PERMS_SEP)
}
