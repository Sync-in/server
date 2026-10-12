import type { ConvertedDiffUpdate } from '../../../common/functions.js'
import type { SyncDiffDto } from '../../sync/dtos/sync-operations.dto.js'
import type { SPACE_OPERATION } from '../constants/spaces.js'
import type { SpaceMemberDto } from '../dto/create-or-update-space.dto.js'
import type { SpaceMembers } from '../schemas/space-members.interface.js'
import type { SpaceRoot } from '../schemas/space-root.interface.js'

export type SpaceMemberUpdate = ConvertedDiffUpdate<SpaceMemberDto, 'permissions' | 'spaceRole'> & Partial<Pick<SpaceMembers, 'role'>>

export interface SpaceRootPermissionUpdate {
  id: SpaceRoot['id']
  rmPermissions: SPACE_OPERATION[]
}

export interface ParseDiffContext {
  regexBasePath: RegExp
  syncDiff: SyncDiffDto
}
