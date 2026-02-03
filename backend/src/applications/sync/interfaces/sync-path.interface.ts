import type { SYNC_PATH_CONFLICT_MODE, SYNC_PATH_DIFF_MODE, SYNC_PATH_MODE } from '../constants/sync'
import type { SyncPath } from '../schemas/sync-path.interface'

export type SyncDBProps = Partial<Pick<SyncPath, 'ownerId' | 'spaceId' | 'spaceRootId' | 'shareId' | 'fileId'>>

export interface SyncPathSettings {
  id?: number
  name: string
  localPath: string
  remotePath: string
  permissions: string
  mode: SYNC_PATH_MODE
  enabled: boolean
  diffMode: SYNC_PATH_DIFF_MODE
  conflictMode: SYNC_PATH_CONFLICT_MODE
  filters: string[]
  scheduler: { value: number; unit: string }
  timestamp: number
  lastSync: Date
}

export interface SyncPathFromClient extends SyncPathSettings {
  id: number
  firstSync: boolean
  mainError: string
  lastErrors: string[]
}
