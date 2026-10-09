import type { SYNC_PATH_CONFLICT_MODE, SYNC_PATH_DIFF_MODE, SYNC_PATH_MODE } from '../constants/sync.js'
import type { SyncPathDto } from '../dtos/sync-path.dto.js'
import type { SyncPath } from '../schemas/sync-path.interface.js'

export type SyncDBProps = Partial<Pick<SyncPath, 'ownerId' | 'spaceId' | 'spaceRootId' | 'shareId' | 'fileId'>>

export interface SyncPathSettings {
  id?: number
  name: string
  localPath: string
  remotePath: string
  permissions?: string | null
  mode: SYNC_PATH_MODE
  ignoreDelete?: boolean | null
  enabled: boolean
  diffMode: SYNC_PATH_DIFF_MODE
  conflictMode: SYNC_PATH_CONFLICT_MODE
  filters: string[]
  scheduler: { value: number; unit: string }
  timestamp: number
  lastSync?: string | number | Date | null
}

export interface SyncPathFromClient extends SyncPathSettings {
  id: number
  firstSync: boolean
  mainError: string
  lastErrors: string[]
}

export type ExistingSyncPathDto = SyncPathDto & { id: number }

export interface SyncPathsDiff {
  add: SyncPathSettings[]
  update: ({ id: number } & Partial<Omit<SyncPathSettings, 'id'>>)[]
  delete: number[]
}
