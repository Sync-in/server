import type { FileTask } from '@sync-in-server/backend/src/applications/files/models/file-task'
import type { Observable } from 'rxjs'

export interface FileUpload extends File {
  relativePath?: string
}

export interface FileUploadTaskRequest {
  completed: Promise<void>
  controller: AbortController
  done: boolean
  req: Observable<any>
  resolveCompleted: () => void
  started: boolean
  task: FileTask
}
