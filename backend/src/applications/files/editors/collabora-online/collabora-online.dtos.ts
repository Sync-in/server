import type { FILE_MODE } from '../../constants/operations'
import type { FileLockProps } from '../../interfaces/file-props.interface'

export interface CollaboraOnlineReqDto {
  documentServerUrl: string
  mode: FILE_MODE
  hasLock: false | FileLockProps
}

export interface CollaboraSaveDocumentDto {
  LastModifiedTime: string
}
