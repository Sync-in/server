import type { ACTION } from '../../../common/constants.js'
import type { Owner } from '../../users/interfaces/owner.interface.js'
import type { UserModel } from '../../users/models/user.model.js'
import type { NOTIFICATION_APP } from '../constants/notifications.js'
import type { Notification } from '../schemas/notification.interface.js'

export interface NotificationContent {
  app: NOTIFICATION_APP
  event: string
  element: string
  url: string
  externalUrl?: string
}

export interface NotificationOptions {
  author?: UserModel
  content?: string
  action?: ACTION
  linkUUID?: string
  linkPassword?: string
}

export type NotificationFromUser = Omit<Notification, 'fromUserId' | 'toUserId'> & { fromUser: Owner }
