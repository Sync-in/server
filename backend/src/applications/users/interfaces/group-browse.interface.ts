import { GROUP_TYPE } from '../constants/group'
import { USER_GROUP_ROLE } from '../constants/user'
import type { Member } from './member.interface'

export interface GroupBrowse {
  parentGroup: { id: number; name: string; type: GROUP_TYPE; role?: USER_GROUP_ROLE }
  members: Member[]
}
