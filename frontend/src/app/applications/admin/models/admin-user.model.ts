import { USER_PERMISSION, USER_PERMS_SEP, USER_ROLE } from '@sync-in-server/backend/src/applications/users/constants/user'
import type { AdminUser } from '@sync-in-server/backend/src/applications/users/interfaces/admin-user.interface'
import type { GuestUser } from '@sync-in-server/backend/src/applications/users/interfaces/guest-user.interface'
import { getNewly, titleCase } from '../../../common/utils/functions'
import { dJs } from '../../../common/utils/time'
import { MemberModel } from '../../users/models/member.model'
import { userAvatarUrl } from '../../users/user.functions'

export class AdminUserModel implements AdminUser {
  id: number
  login: string
  email: string
  firstName?: string
  lastName?: string
  fullName: string
  role: number
  isActive: boolean
  language: string
  notification?: number
  permissions: string
  passwordAttempts: number
  currentAccess: Date
  lastAccess: Date
  currentIp: string
  lastIp: string
  storageQuota: number
  storageUsage: number
  createdAt: Date
  groups?: MemberModel[]
  managers?: MemberModel[]

  // extra properties
  isAdmin = false
  twoFaEnabled?: boolean
  userRoleText: string
  userIsActiveText: string
  avatarUrl?: string
  newly = 0
  hTimeAgo: string
  applications: USER_PERMISSION[] = []

  // hover events
  currentAccessHover = false

  constructor(user: AdminUser) {
    this.setGroups(user)
    this.setManagers(user)
    Object.assign(this, user)
    this.isAdmin = user.role === USER_ROLE.ADMINISTRATOR
    this.userRoleText = titleCase(USER_ROLE[user.role])
    this.avatarUrl = userAvatarUrl(user.login)
    this.userIsActiveText = this.isActive ? 'active' : 'suspended'
    this.hTimeAgo = dJs(this.currentAccess).fromNow(true)
    this.newly = getNewly(this.currentAccess)
    if (this.permissions) {
      this.applications = this.permissions.split(USER_PERMS_SEP) as USER_PERMISSION[]
    }
  }

  private setGroups(user: AdminUser) {
    if (user?.groups) {
      user.groups = user.groups.map((g) => new MemberModel(g))
    }
  }

  private setManagers(guest: GuestUser) {
    if (guest?.managers) {
      guest.managers = guest.managers.map((g) => new MemberModel(g))
    }
  }
}
