import { GuestUser } from '@sync-in-server/backend/src/applications/users/interfaces/guest-user.interface'
import { getNewly } from '../../../common/utils/functions'
import { dJs } from '../../../common/utils/time'
import { userAvatarUrl } from '../user.functions'
import { MemberModel } from './member.model'

export class GuestUserModel implements GuestUser {
  id: number
  login: string
  email: string
  firstName: string
  lastName: string
  fullName: string
  role: number
  isActive: boolean
  passwordAttempts: number
  language: string
  notification: number
  currentAccess: Date
  lastAccess: Date
  currentIp: string
  lastIp: string
  createdAt: Date
  managers: MemberModel[]

  // extra properties
  userIsActiveText: string
  avatarUrl?: string
  newly = 0
  hTimeAgo: string

  // hover events
  currentAccessHover = false

  constructor(guest: GuestUser) {
    this.setManagers(guest)
    Object.assign(this, guest)
    this.avatarUrl = userAvatarUrl(guest.login)
    this.userIsActiveText = this.isActive ? 'active' : 'suspended'
    this.hTimeAgo = dJs(this.currentAccess).fromNow(true)
    this.newly = getNewly(this.currentAccess)
  }

  private setManagers(guest: GuestUser) {
    if (guest?.managers) {
      guest.managers = guest.managers.map((g) => new MemberModel(g))
    }
  }
}
