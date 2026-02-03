import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { NOTIFICATION_APP } from '@sync-in-server/backend/src/applications/notifications/constants/notifications'
import type {
  NotificationContent,
  NotificationFromUser
} from '@sync-in-server/backend/src/applications/notifications/interfaces/notification-properties.interface'
import type { Owner } from '@sync-in-server/backend/src/applications/users/interfaces/owner.interface'
import { userAvatarUrl } from '../../users/user.functions'
import { NOTIFICATION_ICON } from '../notifications.constants'

export class NotificationModel implements NotificationFromUser {
  id: number
  fromUser: Owner & { avatarUrl: string }
  content: NotificationContent
  wasRead: boolean
  createdAt: Date

  // extra properties
  soonRead = false
  appIcon: IconDefinition
  mainElement: string

  constructor(props: NotificationFromUser) {
    Object.assign(this, props)
    if (!this.fromUser) {
      this.fromUser = { id: -1, login: null, email: null, fullName: 'Info', avatarUrl: null }
    } else {
      this.fromUser.avatarUrl = userAvatarUrl(this.fromUser.login)
    }
    this.appIcon = NOTIFICATION_ICON[this.content.app]
    this.setMainElement()
  }

  private setMainElement() {
    if (
      this.content.app === NOTIFICATION_APP.COMMENTS ||
      this.content.app === NOTIFICATION_APP.SHARES ||
      this.content.app === NOTIFICATION_APP.UPDATE_AVAILABLE ||
      this.content.app === NOTIFICATION_APP.SYNC
    ) {
      return
    }
    if (this.content?.url) {
      const urlFragments = this.content.url.split('/')
      if (urlFragments.length > 1) {
        this.mainElement = urlFragments[urlFragments.length - 1]
      }
    }
  }
}
