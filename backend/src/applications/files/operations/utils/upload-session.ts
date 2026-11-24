import { isUuidV4 } from '../../../../common/validation.js'
import { FILE_OPERATION } from '../../core/constants/operations.js'
import { serverTemporaryEntryPrefix, serverTemporaryEntryUserId } from '../../core/utils/files.js'
import { FILE_UPLOAD_SESSION } from '../constants/upload-session.js'

// Temporary roots are flat and may contain several actors, so the basename carries both ownership and session identity.
export function fileUploadSessionDirectoryName(userId: number, uploadId: string): string {
  if (!isUuidV4(uploadId)) throw new Error('Upload identifier must be a UUID v4')
  return `${serverTemporaryEntryPrefix(userId)}${FILE_OPERATION.UPLOAD}-${uploadId}-${FILE_UPLOAD_SESSION.DIRECTORY_TARGET}`
}

export function isFileUploadSessionDirectoryName(value: string): boolean {
  const userId = serverTemporaryEntryUserId(value)
  if (userId === undefined) return false
  const prefix = `${serverTemporaryEntryPrefix(userId)}${FILE_OPERATION.UPLOAD}-`
  const suffix = `-${FILE_UPLOAD_SESSION.DIRECTORY_TARGET}`
  return value.startsWith(prefix) && value.endsWith(suffix) && isUuidV4(value.slice(prefix.length, -suffix.length))
}
