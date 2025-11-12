/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import type { Share } from '../../shares/schemas/share.interface'
import type { SpaceRoot } from '../../spaces/schemas/space-root.interface'
import type { Space } from '../../spaces/schemas/space.interface'
import type { SyncPath } from '../../sync/schemas/sync-path.interface'
import type { Owner } from '../../users/interfaces/owner.interface'
import type { File } from '../schemas/file.interface'

export interface FileLockProps {
  owner: string
  ownerLogin: string
  isExclusive: boolean
}

export interface FileProps extends Omit<File, 'ownerId' | 'spaceId' | 'spaceExternalRootId' | 'shareExternalId' | 'inTrash'> {
  id: number
  name: string
  path: string
  isDir: boolean
  size: number
  ctime: number
  mtime: number
  mime: string
  inTrash?: boolean
  // used with shares
  origin?: {
    ownerId: number
    ownerLogin: string
    spaceId: number
    spaceAlias: string
    spaceExternalRootId: number
    spaceRootExternalPath: string
    shareExternalId: number
  }
  // root can be a share or a space root
  // enabled, and description are only used for shares
  root?: Pick<SpaceRoot, 'id' | 'alias' | 'permissions'> &
    Partial<Pick<SpaceRoot, 'name' | 'externalPath'>> &
    Partial<Pick<Share, 'enabled' | 'description'>> & {
      owner: Owner
    }
  lock?: FileLockProps
  // used by the file browser to enrich files
  spaces?: Pick<Space, 'id' | 'alias' | 'name'>[]
  shares?: Pick<Share, 'id' | 'alias' | 'name' | 'type'>[]
  syncs?: Pick<SyncPath, 'clientId' | 'id'> & { clientName: string }[]
  hasComments?: boolean
}
