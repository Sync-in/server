import type { FileTask } from '@sync-in-server/backend/src/applications/files/tasks/models/file-task'

export interface FileUpload extends File {
  relativePath?: string
}

export interface FileUploadGroup {
  multipartBatches: FileUploadMultipartBatch[]
  sessionFiles: FileUpload[]
  size: number
}

export interface FileUploadMultipartBatch {
  fileCount: number
  form: FormData
  size: number
}

export interface FileUploadTaskRequest {
  completed: Promise<void>
  controller: AbortController
  discarded: boolean
  done: boolean
  notifyCompletion: boolean
  resolveCompleted: () => void
  run: (task: FileTask, signal: AbortSignal) => Promise<void>
  started: boolean
  task: FileTask
  userId?: number
  userImpersonate: boolean
}
