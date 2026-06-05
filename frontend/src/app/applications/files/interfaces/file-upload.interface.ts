import type { FileTask } from '@sync-in-server/backend/src/applications/files/models/file-task'
import type { Observable } from 'rxjs'

export interface FileUpload extends File {
  relativePath?: string
}

export interface FileUploadTaskRequest {
  controller: AbortController
  done: boolean
  req: Observable<any>
  started: boolean
  task: FileTask
}
