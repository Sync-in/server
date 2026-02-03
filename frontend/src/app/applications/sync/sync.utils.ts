import { SPACE_OPERATION } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import { SPACES_PATH } from '../spaces/spaces.constants'

export function hasWritePermission(permissions: string): boolean {
  if (permissions) {
    return permissions.includes(SPACE_OPERATION.MODIFY) && permissions.includes(SPACE_OPERATION.DELETE) && permissions.includes(SPACE_OPERATION.ADD)
  }
  return false
}

export function isSynchronizable(path: string, canCreateDir = false): boolean {
  const urlSegments = path.split('/')
  return (
    (urlSegments[0] === SPACES_PATH.FILES && urlSegments.length > 3) ||
    (urlSegments[0] === SPACES_PATH.SHARES && urlSegments.length > (canCreateDir ? 2 : 1)) ||
    urlSegments.length > 2
  )
}

export function getServerPath(path: string): string {
  let segments: string[] = path.split('/').filter(Boolean)
  if (!segments.length) {
    return ''
  }
  if (segments[0] === SPACES_PATH.FILES) {
    if (segments[1] === SPACES_PATH.PERSONAL) {
      segments = segments.slice(2)
      segments.unshift(SPACES_PATH.PERSONAL)
    } else {
      segments[0] = SPACES_PATH.SPACES
    }
  }
  return segments.join('/')
}
