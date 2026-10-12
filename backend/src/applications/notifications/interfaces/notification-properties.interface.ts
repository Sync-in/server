import type { ACTION } from '../../../common/constants.js'
import type { Owner } from '../../users/interfaces/owner.interface.js'
import type { UserModel } from '../../users/models/user.model.js'
import type { NOTIFICATION_APP } from '../constants/notifications.js'
import type { Notification } from '../schemas/notification.interface.js'

interface NotificationContentBase {
  event: string
  element: string
  externalUrl?: string
}

type NotificationAppWithoutUrl = NOTIFICATION_APP.LINKS | NOTIFICATION_APP.UPDATE_AVAILABLE

export type NotificationContentFor<T extends NOTIFICATION_APP = NOTIFICATION_APP> = {
  [App in T]: NotificationContentBase & {
    app: App
    url: App extends NotificationAppWithoutUrl ? null : string
  }
}[T]

export type NotificationContent = NotificationContentFor
export type NotificationContentWithUrl = NotificationContentFor<Exclude<NOTIFICATION_APP, NotificationAppWithoutUrl>>

export interface NotificationOptions {
  author?: UserModel
  content?: string
  action?: ACTION
  linkUUID?: string
  linkPassword?: string
}

type NotificationAppWithoutOptions = NOTIFICATION_APP.AUTH_2FA | NOTIFICATION_APP.AUTH_LOCKED | NOTIFICATION_APP.UPDATE_AVAILABLE

type NotificationOptionsFor<App extends NOTIFICATION_APP> = NotificationOptions &
  (App extends NOTIFICATION_APP.COMMENTS
    ? { author: UserModel; content: string }
    : App extends NOTIFICATION_APP.UNLOCK_REQUEST
      ? { author: UserModel }
      : App extends NOTIFICATION_APP.SPACE_ROOTS
        ? { author: UserModel; action: ACTION }
        : App extends NOTIFICATION_APP.LINKS
          ? { action: ACTION; linkUUID: string }
          : App extends NOTIFICATION_APP.SPACES | NOTIFICATION_APP.SHARES | NOTIFICATION_APP.SYNC
            ? { action: ACTION }
            : unknown)

export type NotificationArguments = {
  [App in NOTIFICATION_APP]: App extends NotificationAppWithoutOptions
    ? [content: NotificationContentFor<App>, options?: NotificationOptionsFor<App>]
    : [content: NotificationContentFor<App>, options: NotificationOptionsFor<App>]
}[NOTIFICATION_APP]

export type NotificationMail = {
  [App in NOTIFICATION_APP]: NotificationContentFor<App> &
    (App extends NotificationAppWithoutOptions ? { options?: NotificationOptionsFor<App> } : { options: NotificationOptionsFor<App> })
}[NOTIFICATION_APP]

export type NotificationFromUser = Omit<Notification, 'fromUserId' | 'toUserId'> & { fromUser: Owner | null }
