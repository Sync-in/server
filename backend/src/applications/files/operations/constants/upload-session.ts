// Absolute session lifetime, independent of recent status checks or chunk activity.
export const FILE_UPLOAD_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000

export const FILE_UPLOAD_SESSION_HEADER = {
  CHECKSUM: 'upload-checksum',
  // Used by the sync client to update its remote snapshot after publication.
  INO: 'upload-ino',
  LENGTH: 'upload-length',
  MTIME: 'upload-mtime',
  OFFSET: 'upload-offset',
  STATE: 'upload-state',
  VALIDATED_OFFSET: 'upload-validated-offset'
} as const

export const FILE_UPLOAD_SESSION_CHECKSUM_MODE = {
  CHUNK_SUFFIX: 'chunk-suffix',
  SYNC_RAW: 'sync-raw'
} as const

export const FILE_UPLOAD_SESSION_CHECKSUM_SIZE = 32
export const FILE_UPLOAD_SESSION_PERSISTED_STATE_VERSION = 1

export const FILE_UPLOAD_SESSION_STATE = {
  COMPLETE: 'complete',
  READY: 'ready',
  UPLOADING: 'uploading'
} as const

export const FILE_UPLOAD_SESSION = {
  DIRECTORY_TARGET: 'session',
  LOCK: 'write.lock',
  MANIFEST: 'session.json',
  PAYLOAD: 'payload.part',
  STATE: 'state.json'
} as const
