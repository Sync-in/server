import { uniquePermissions } from '../../../common/functions.js'
import { MEMBER_TYPE } from '../../users/constants/member.js'
import { Member } from '../../users/interfaces/member.interface.js'
import { SPACE_ALL_OPERATIONS, SPACE_ROLE } from '../constants/spaces.js'
import type { Space } from '../schemas/space.interface.js'
import type { SpaceRootProps } from './space-root-props.model.js'

export class SpaceProps implements Space {
  id!: Space['id']
  alias!: Space['alias']
  name!: Space['name']
  enabled!: Space['enabled']
  description!: Space['description']
  storageQuota!: Space['storageQuota']
  storageUsage!: Space['storageUsage']
  storageIndexing!: Space['storageIndexing']
  modifiedAt!: Space['modifiedAt']
  disabledAt!: Space['disabledAt']
  createdAt!: Space['createdAt']

  // Extra properties
  members: Member[] = []
  roots: SpaceRootProps[] = []
  permissions!: string
  role?: number
  counts?: { users: number; groups: number; links: number; roots?: number; shares: number }

  constructor(props: Partial<SpaceProps>, userId?: number) {
    if (props?.role === SPACE_ROLE.IS_MANAGER) {
      props.permissions = SPACE_ALL_OPERATIONS
    } else if (props.permissions) {
      props.permissions = uniquePermissions(props.permissions)
    }

    Object.assign(this, props)

    if (userId) {
      this.setCounts(userId)
    }
  }

  setCounts(userId: number) {
    this.counts = { users: 0, groups: 0, links: 0, roots: 0, shares: 0 }
    for (const m of this.members) {
      if (m.type === MEMBER_TYPE.USER || m.type === MEMBER_TYPE.GUEST) {
        if (m.linkId) {
          this.counts.links++
        } else {
          this.counts.users++
        }
      } else {
        this.counts.groups++
      }
    }
    for (const r of this.roots) {
      if (r.owner?.id === userId) {
        this.counts.roots = (this.counts.roots ?? 0) + 1
      }
    }
  }
}
