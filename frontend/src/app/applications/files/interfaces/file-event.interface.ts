import { FileTaskStatus } from '@sync-in-server/backend/src/applications/files/models/file-task'

export interface FileEvent {
  filePath: string
  fileName?: string
  fileDstPath?: string
  reload?: boolean
  delete?: boolean
  focus?: boolean
  archiveId?: string
  // special case on move task, the src is removed, the dst is added
  reloadFocusOnDst?: boolean
  status?: FileTaskStatus
}
