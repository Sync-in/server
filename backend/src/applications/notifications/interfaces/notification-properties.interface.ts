import type { ACTION } from '../../../common/constants'
import type { Owner } from '../../users/interfaces/owner.interface'
import type { UserModel } from '../../users/models/user.model'
import type { NOTIFICATION_APP } from '../constants/notifications'
import type { Notification } from '../schemas/notification.interface'

export interface NotificationContent {
  app: NOTIFICATION_APP
  event: string
  element: string
  url: string
  externalUrl?: string
}

export interface NotificationOptions {
  author?: UserModel
  currentUrl?: string
  content?: string
  action?: ACTION
  linkUUID?: string
  linkPassword?: string
}

export type NotificationFromUser = Omit<Notification, 'fromUserId' | 'toUserId'> & { fromUser: Owner }
