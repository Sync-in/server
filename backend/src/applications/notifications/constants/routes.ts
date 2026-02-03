import { APP_BASE_ROUTE } from '../../applications.constants'

export const NOTIFICATIONS_ROUTE = {
  BASE: `${APP_BASE_ROUTE}/notifications`,
  UNREAD: 'unread'
} as const

export const API_NOTIFICATIONS = NOTIFICATIONS_ROUTE.BASE
