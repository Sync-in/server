import type { FILE_MODE } from '../../constants/operations.js'
import type { FileLockProps } from '../../interfaces/file-props.interface.js'

export interface CollaboraOnlineReqDto {
  documentServerUrl: string
  mode: FILE_MODE
  hasLock: false | FileLockProps
}

export interface CollaboraSaveDocumentDto {
  LastModifiedTime: string
}
