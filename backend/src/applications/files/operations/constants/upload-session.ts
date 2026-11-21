import { isUuidV4 } from '../../../../common/validation.js'
import { TEMPORARY_FILE_PREFIX } from '../../core/constants/files.js'
import { FILE_OPERATION } from '../../core/constants/operations.js'

// Bounds persistent upload-session metadata for one actor on a single storage.
export const FILE_UPLOAD_SESSION_MAX_ACTIVE_PER_ACTOR = 64
// Absolute session lifetime, independent of recent status checks or chunk activity.
export const FILE_UPLOAD_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000

export const FILE_UPLOAD_SESSION_HEADER = {
  // Used by the sync client to update its remote snapshot after publication.
  INO: 'Upload-Ino',
  LENGTH: 'Upload-Length',
  OFFSET: 'Upload-Offset',
  STATE: 'Upload-State'
} as const

export const FILE_UPLOAD_SESSION_STATE = {
  COMPLETE: 'complete',
  READY: 'ready',
  UPLOADING: 'uploading'
} as const

export const FILE_UPLOAD_SESSION = {
  DIRECTORY_TARGET: 'session',
  LOCK: 'write.lock',
  MANIFEST: 'session.json',
  PAYLOAD: 'payload.part'
} as const

export function isFileUploadSessionDirectoryName(value: string): boolean {
  const prefix = `${TEMPORARY_FILE_PREFIX}${FILE_OPERATION.UPLOAD}-`
  const suffix = `-${FILE_UPLOAD_SESSION.DIRECTORY_TARGET}`
  return value.startsWith(prefix) && value.endsWith(suffix) && isUuidV4(value.slice(prefix.length, -suffix.length))
}
