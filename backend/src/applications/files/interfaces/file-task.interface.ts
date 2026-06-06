import type { FileTask } from '../models/file-task'

export interface FileTasksPollResponse {
  active: FileTask[]
  ended: FileTask[]
  missingIds: string[]
}
export interface FileTaskTransferOptions {
  beforeCommit?: () => Promise<void>
  cacheKey: string
  crossDevice?: boolean
  onTransferStart?: (temporaryPath: string) => void
  onProgress?: (bytes: number) => void
  overwrite?: boolean
  signal: AbortSignal
  stagingDir?: string
}

export interface FileTaskCopyTaskOptions extends FileTaskTransferOptions {
  preserveTimestamps?: boolean
  recursive?: boolean
}
