import { GROUP_TYPE } from '../constants/group.js'
import { USER_GROUP_ROLE } from '../constants/user.js'
import type { Member } from './member.interface.js'

export interface GroupBrowse {
  parentGroup: { id: number; name: string; type: GROUP_TYPE; role?: USER_GROUP_ROLE }
  members: Member[]
}
