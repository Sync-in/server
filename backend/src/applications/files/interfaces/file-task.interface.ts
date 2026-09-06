import type { FileTask } from '../models/file-task'
import type { FILE_OPERATION } from '../constants/operations'

export interface FileTasksPollResponse {
  active: FileTask[]
  ended: FileTask[]
  missingIds: string[]
}
export interface FileTaskTransferOptions {
  beforeCommit?: () => Promise<void>
  beforeTransfer?: () => Promise<void>
  executionId: string
  onTransferStart?: () => void
  onProgress?: (bytes: number) => void
  operation: FILE_OPERATION
  overwrite?: boolean
  signal: AbortSignal
  stagingDir?: string
}

export interface FileTaskCopyTaskOptions extends FileTaskTransferOptions {
  preserveTimestamps?: boolean
  recursive?: boolean
}

export interface FileTaskExtractionEntry {
  path: string
  isDirectory: boolean
  size: number
}
