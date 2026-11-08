import { SYNC_PATH_CONFLICT_MODE, SYNC_PATH_DIFF_MODE, SYNC_PATH_MODE } from '@sync-in-server/backend/src/applications/sync/constants/sync'
import type { SyncWizardPath } from '../models/sync-wizard-path.model'

export interface SyncWizardLocalPath {
  name: string
  path: string
  mimeUrl: string
  origin: string | null
}

export interface SyncWizardState {
  localPath: SyncWizardLocalPath | null
  remotePath: SyncWizardPath | null
  settings: {
    conflictMode: SYNC_PATH_CONFLICT_MODE
    diffMode: SYNC_PATH_DIFF_MODE
    enabled: boolean
    ignoreDelete: boolean
    mode: SYNC_PATH_MODE
    name: string
    scheduler: { unit: string; value: number }
  }
}
