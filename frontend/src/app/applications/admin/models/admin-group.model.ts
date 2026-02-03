import { GROUP_TYPE, GROUP_VISIBILITY } from '@sync-in-server/backend/src/applications/users/constants/group'
import { USER_PERMISSION, USER_PERMS_SEP } from '@sync-in-server/backend/src/applications/users/constants/user'
import type { AdminGroup } from '@sync-in-server/backend/src/applications/users/interfaces/admin-group.interface'

export class AdminGroupModel implements AdminGroup {
  id: number
  name: string
  type: GROUP_TYPE
  description: string
  createdAt: Date
  modifiedAt: Date
  parent: AdminGroup['parent']
  visibility: GROUP_VISIBILITY
  permissions: string
  applications: USER_PERMISSION[]

  constructor(group: AdminGroup) {
    Object.assign(this, group)
    if (this.permissions) {
      this.applications = this.permissions.split(USER_PERMS_SEP) as USER_PERMISSION[]
    }
  }
}
