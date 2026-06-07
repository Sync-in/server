import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import type { FileTask } from '@sync-in-server/backend/src/applications/files/models/file-task'

export type TaskProgressbarType = 'warning' | 'danger' | null
export type TaskProgressItemType = 'currentSize' | 'totalSize' | 'size' | 'directories' | 'files' | 'endedAt'

export interface TaskProgressItem {
  icon?: IconDefinition
  type: TaskProgressItemType
  value: number
}

export interface FileTaskView extends FileTask {
  ui: {
    cancelled: boolean
    cancellable: boolean
    displayPriority: number
    error: boolean
    openable: boolean
    operationIcon: IconDefinition
    pending: boolean
    progress: number
    progressItems: TaskProgressItem[]
    progressType: TaskProgressbarType
    queued: boolean
    statusIcon: IconDefinition
  }
}
