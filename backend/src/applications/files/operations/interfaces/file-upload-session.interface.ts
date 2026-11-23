import type {
  FILE_UPLOAD_SESSION_CHECKSUM_MODE,
  FILE_UPLOAD_SESSION_PERSISTED_STATE_VERSION,
  FILE_UPLOAD_SESSION_STATE
} from '../constants/upload-session.js'

export type FileUploadSessionMethod = 'POST' | 'PUT'

export interface FileUploadSessionChunkHeaders {
  contentLength: unknown
  contentType: unknown
  uploadLength: unknown
  uploadOffset: unknown
}

export interface FileUploadSessionMetadataHeaders {
  checksum?: unknown
  mtime?: unknown
}

export interface FileUploadSessionMetadata {
  checksum?: string
  mtime?: number
}

export interface FileUploadSessionCreate extends FileUploadSessionMetadata {
  checksumMode?: FileUploadSessionChecksumMode
  size: number
}

export type FileUploadSessionChecksumMode = (typeof FILE_UPLOAD_SESSION_CHECKSUM_MODE)[keyof typeof FILE_UPLOAD_SESSION_CHECKSUM_MODE]

export interface FileUploadSessionManifest {
  checksum?: string
  checksumMode?: FileUploadSessionChecksumMode
  destination: string
  expectedSize: number
  method: FileUploadSessionMethod
  mtime?: number
}

export type FileUploadSessionState = (typeof FILE_UPLOAD_SESSION_STATE)[keyof typeof FILE_UPLOAD_SESSION_STATE]

export interface FileUploadSessionStatus {
  // Used by the sync client to update its remote snapshot after publication.
  ino?: number
  offset: number
  size: number
  state: FileUploadSessionState
  validatedOffset?: number
}

export interface FileUploadSessionContext {
  directory: string
  manifest: FileUploadSessionManifest
  payload: string
  state: string
}

export interface FileUploadSessionPersistentState {
  validatedOffset: number
  version: typeof FILE_UPLOAD_SESSION_PERSISTED_STATE_VERSION
}
