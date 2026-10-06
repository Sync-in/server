import type { MEMBER_TYPE } from '../constants/member.js'
import type { Group } from '../schemas/group.interface.js'
import type { Member } from './member.interface.js'

export type GroupMember = Pick<Group, 'id' | 'name' | 'description' | 'createdAt' | 'modifiedAt'> & { type: MEMBER_TYPE; counts?: { users: number } }

export type GroupWithMembers = GroupMember & {
  members: Member[]
}
