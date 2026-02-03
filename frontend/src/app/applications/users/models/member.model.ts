import type { LinkGuest } from '@sync-in-server/backend/src/applications/links/interfaces/link-guest.interface'
import { SPACE_OPERATION, SPACE_ROLE } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import { MEMBER_TYPE } from '@sync-in-server/backend/src/applications/users/constants/member'
import { USER_GROUP_ROLE } from '@sync-in-server/backend/src/applications/users/constants/user'
import type { Member } from '@sync-in-server/backend/src/applications/users/interfaces/member.interface'
import { getNewly } from '../../../common/utils/functions'
import { setBooleanPermissions } from '../../spaces/spaces.functions'
import { OwnerType } from '../interfaces/owner.interface'
import { userAvatarUrl } from '../user.functions'

export class MemberModel implements Member {
  id: number
  name: string
  description: string
  type: MEMBER_TYPE
  permissions: string
  createdAt?: Date
  modifiedAt?: Date
  spaceRole?: SPACE_ROLE
  groupRole?: USER_GROUP_ROLE
  login?: string
  linkId?: number
  counts?: { users?: number; groups?: number }

  // extra properties
  mid: string // member id
  hPerms?: Partial<Record<`${SPACE_OPERATION}`, boolean>>
  newly = 0
  linkSettings: LinkGuest = null
  avatarUrl?: string
  isUser: boolean
  isGuest: boolean
  isLink: boolean
  isGroup: boolean
  isPersonalGroup: boolean
  isGroupManager: boolean

  constructor(m: Member, omitPermissions: SPACE_OPERATION[] = []) {
    Object.assign(this, m)
    this.mid = `${m.type[0]}${m.id}`
    this.hPerms = setBooleanPermissions(m.permissions, omitPermissions)
    if (m.login) {
      this.avatarUrl = userAvatarUrl(m.login)
    }
    this.isLink = !!this.linkId
    this.isGuest = this.type === MEMBER_TYPE.GUEST
    this.isUser = this.isGuest || (this.type === MEMBER_TYPE.USER && !this.isLink)
    this.isGroup = this.type === MEMBER_TYPE.GROUP || this.type === MEMBER_TYPE.PGROUP
    this.isPersonalGroup = this.type === MEMBER_TYPE.PGROUP
    this.setGroupRole()
    if (this.modifiedAt) {
      this.newly = getNewly(this.modifiedAt)
    } else if (this.createdAt) {
      this.newly = getNewly(this.createdAt)
    }
  }

  setGroupRole(role?: USER_GROUP_ROLE) {
    if (typeof role !== 'undefined') {
      this.groupRole = role
    }
    this.isGroupManager = this.groupRole === USER_GROUP_ROLE.MANAGER
  }
}

export function ownerToMember(owner: OwnerType, role?: SPACE_ROLE, groupRole?: USER_GROUP_ROLE): MemberModel {
  return new MemberModel({
    id: owner.id,
    login: owner.login,
    name: owner.fullName,
    description: owner.email,
    type: MEMBER_TYPE.USER,
    spaceRole: role || SPACE_ROLE.IS_MEMBER,
    groupRole: groupRole || USER_GROUP_ROLE.MEMBER,
    permissions: ''
  })
}
