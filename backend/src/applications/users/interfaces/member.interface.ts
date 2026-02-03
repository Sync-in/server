import type { CreateOrUpdateLinkDto } from '../../links/dto/create-or-update-link.dto'
import type { SPACE_ROLE } from '../../spaces/constants/spaces'
import type { MEMBER_TYPE } from '../constants/member'
import type { USER_GROUP_ROLE } from '../constants/user'

export interface Member {
  id: number
  name: string // user full name or group name
  description: string // user email or group description
  type: MEMBER_TYPE
  login?: string // only for user
  linkId?: number // only for link
  linkSettings?: CreateOrUpdateLinkDto // only for link
  permissions?: string
  createdAt?: Date
  modifiedAt?: Date
  spaceRole?: SPACE_ROLE // only for user
  groupRole?: USER_GROUP_ROLE // only for groups
  counts?: { users?: number; groups?: number } // only for admin group members
}
