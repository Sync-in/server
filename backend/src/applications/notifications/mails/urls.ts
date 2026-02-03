import { PUBLIC_LINKS_ROUTE } from '../../links/constants/routes'
import { SPACES_BASE_ROUTE } from '../../spaces/constants/routes'
import { SYNC_BASE_ROUTE } from '../../sync/constants/routes'
import { NotificationContent } from '../interfaces/notification-properties.interface'

export function urlSpaceBase(url: string): string {
  return url ? `${url}/#/${SPACES_BASE_ROUTE}` : ''
}

export function urlFromSpaceFile(url: string, notification: NotificationContent): string {
  return `${urlSpaceBase(url)}/${notification.url}?select=${notification.element}`
}

export function urlFromLink(url: string, uuid: string): string {
  return `${url}/#/${PUBLIC_LINKS_ROUTE.LINK}/${uuid}`
}

export function urlFromSpace(url: string, spaceName?: string) {
  return `${urlSpaceBase(url)}${spaceName ? `?select=${spaceName}` : ''}`
}

export function urlFromSync(url: string): string {
  return `${url}/#/${SYNC_BASE_ROUTE}`
}
