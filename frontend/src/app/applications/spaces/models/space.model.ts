/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { SPACE_OPERATION, SPACE_ROLE } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import type { SpaceProps } from '@sync-in-server/backend/src/applications/spaces/models/space-props.model'
import type { SpaceRootProps } from '@sync-in-server/backend/src/applications/spaces/models/space-root-props.model'
import type { Member } from '@sync-in-server/backend/src/applications/users/interfaces/member.interface'
import { popFromObject } from '@sync-in-server/backend/src/common/shared'
import { getNewly } from '../../../common/utils/functions'
import { sortCollectionByDate } from '../../../common/utils/sort'
import { dJs } from '../../../common/utils/time'
import { getAssetsMimeUrl, mimeDirectory } from '../../files/files.constants'
import { MemberModel } from '../../users/models/member.model'
import { userAvatarUrl } from '../../users/user.functions'
import { SPACES_PERMISSIONS_TEXT } from '../spaces.constants'
import { setBooleanPermissions, setTextIconPermissions } from '../spaces.functions'

export interface SpaceRootModel extends SpaceRootProps {
  hPerms: Partial<Record<`${SPACE_OPERATION}`, boolean>>
  isRenamed: boolean
  isDir: boolean
}

export class SpaceModel implements Partial<SpaceProps> {
  id: number
  alias: string
  type: number
  name: string
  description: string
  enabled: boolean
  storageUsage: number
  storageQuota: number
  storageIndexing: boolean
  modifiedAt: Date
  disabledAt: Date
  createdAt: Date
  permissions: string
  role?: number
  roots?: SpaceRootModel[] = []

  // computed properties
  managers: MemberModel[] = []
  members: MemberModel[] = []
  links: MemberModel[] = []
  counts: { users: number; groups: number; links: number; roots: number; shares: number }

  // extra properties
  hPerms: Partial<typeof SPACES_PERMISSIONS_TEXT> = {}
  hTimeAgo: string

  // states
  newly = 0

  constructor(space: SpaceProps) {
    this.hPerms = setTextIconPermissions(space.permissions)
    this.setMembers(popFromObject('members', space))
    this.setRoots(popFromObject('roots', space))
    Object.assign(this, space)
    this.hTimeAgo = dJs(this.modifiedAt).fromNow(true)
    this.newly = getNewly(this.modifiedAt)
    this.sort()
  }

  addRoot(root: Partial<SpaceRootModel>, unshift = false) {
    root.hPerms = setBooleanPermissions(root.permissions, [SPACE_OPERATION.SHARE_INSIDE])
    if (root.owner?.login) {
      root.owner.avatarUrl = userAvatarUrl(root.owner.login)
    }
    root.file.mimeUrl = getAssetsMimeUrl(root.file?.mime ? root.file.mime : mimeDirectory)
    if (unshift) {
      this.roots.unshift(root as SpaceRootModel)
    } else {
      this.roots.push(root as SpaceRootModel)
    }
    root.isDir = root.file.mime === mimeDirectory || !!root.externalPath
  }

  havePermission(permission: SPACE_OPERATION) {
    return this.permissions.indexOf(permission) > -1
  }

  private setMembers(members: Member[]) {
    if (!members) return
    for (const member of members) {
      const m = new MemberModel(member)
      if (m.isLink) {
        this.links.push(m)
      } else if (m.spaceRole === SPACE_ROLE.IS_MANAGER) {
        this.managers.push(m)
      } else {
        this.members.push(m)
      }
    }
  }

  private setRoots(roots: Partial<SpaceRootModel>[]) {
    if (!roots) return
    for (const root of roots) {
      this.addRoot(root)
    }
  }

  private sort() {
    sortCollectionByDate(this.roots, 'createdAt', false)
    sortCollectionByDate(this.managers, 'createdAt', false)
    sortCollectionByDate(this.members, 'createdAt', false)
    sortCollectionByDate(this.links, 'createdAt', false)
  }
}
