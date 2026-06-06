import type { FileTask } from '../models/file-task'

export interface FileTasksPollResponse {
  active: FileTask[]
  ended: FileTask[]
  missingIds: string[]
}
