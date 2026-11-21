import type { FILE_UPLOAD_SESSION_STATE } from '../constants/upload-session.js'

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
  size: number
}

export interface FileUploadSessionManifest {
  checksum?: string
  chunkSize: number
  destination: string
  expectedSize: number
  method: FileUploadSessionMethod
  mtime?: number
  version: 1
}

export type FileUploadSessionState = (typeof FILE_UPLOAD_SESSION_STATE)[keyof typeof FILE_UPLOAD_SESSION_STATE]

export interface FileUploadSessionStatus {
  // Used by the sync client to update its remote snapshot after publication.
  ino?: number
  offset: number
  size: number
  state: FileUploadSessionState
}

export interface FileUploadSessionContext {
  directory: string
  manifest: FileUploadSessionManifest
  payload: string
}
