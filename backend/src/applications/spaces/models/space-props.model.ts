/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { uniquePermissions } from '../../../common/functions'
import { MEMBER_TYPE } from '../../users/constants/member'
import { Member } from '../../users/interfaces/member.interface'
import { SPACE_ALL_OPERATIONS, SPACE_ROLE } from '../constants/spaces'
import { Space } from '../schemas/space.interface'
import { SpaceRootProps } from './space-root-props.model'

export class SpaceProps implements Space {
  id: number
  alias: string
  name: string
  enabled: boolean
  description: string
  storageQuota: number
  storageUsage: number
  storageIndexing: boolean
  modifiedAt: Date
  disabledAt: Date
  createdAt: Date

  // Extra properties
  members: Member[] = []
  roots?: SpaceRootProps[] = []
  permissions: string
  role?: number
  counts?: { users: number; groups: number; links: number; roots: number; shares: number }

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
        this.counts.roots++
      }
    }
  }
}
