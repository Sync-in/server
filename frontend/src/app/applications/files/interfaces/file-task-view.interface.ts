import type { LucideIcon } from '@lucide/angular'
import type { FileTask } from '@sync-in-server/backend/src/applications/files/models/file-task'

export type TaskProgressbarType = 'warning' | 'danger' | null
export type TaskProgressItemType = 'currentSize' | 'totalSize' | 'size' | 'directories' | 'files' | 'endedAt'

export interface TaskProgressItem {
  icon?: LucideIcon
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
    operationIcon: LucideIcon
    pending: boolean
    progress: number
    progressItems: TaskProgressItem[]
    progressType: TaskProgressbarType
    queued: boolean
    statusIcon: LucideIcon
  }
}
