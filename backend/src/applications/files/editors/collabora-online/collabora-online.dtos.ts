import type { FILE_MODE } from '../../core/constants/operations.js'
import type { FileLockProps } from '../../core/interfaces/file-props.interface.js'

export interface CollaboraOnlineReqDto {
  documentServerUrl: string
  mode: FILE_MODE
  hasLock: false | FileLockProps
}

export interface CollaboraSaveDocumentDto {
  LastModifiedTime: string
}
