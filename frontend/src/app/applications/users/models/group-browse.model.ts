import type { GroupBrowse } from '@sync-in-server/backend/src/applications/users/interfaces/group-browse.interface'
import { MemberModel } from './member.model'

export class GroupBrowseModel implements GroupBrowse {
  parentGroup: GroupBrowse['parentGroup']
  members: MemberModel[]

  constructor(browse: GroupBrowse) {
    this.parentGroup = browse.parentGroup
    this.members = browse.members.map((m) => new MemberModel(m))
  }
}
