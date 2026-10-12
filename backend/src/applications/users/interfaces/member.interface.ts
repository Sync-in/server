import type { CreateOrUpdateLinkDto } from '../../links/dto/create-or-update-link.dto.js'
import type { SPACE_ROLE } from '../../spaces/constants/spaces.js'
import type { MEMBER_TYPE } from '../constants/member.js'
import type { USER_GROUP_ROLE } from '../constants/user.js'

export interface Member {
  id: number
  name: string // user full name or group name
  description: string | null // user email or group description
  type: MEMBER_TYPE
  login?: string | null // only for user
  linkId?: number | null // only for link
  linkSettings?: CreateOrUpdateLinkDto | null // only for link
  permissions?: string | null
  createdAt?: Date | null
  modifiedAt?: Date | null
  spaceRole?: SPACE_ROLE // only for user
  groupRole?: USER_GROUP_ROLE // only for groups
  counts?: { users?: number; groups?: number } // only for admin group members
}
