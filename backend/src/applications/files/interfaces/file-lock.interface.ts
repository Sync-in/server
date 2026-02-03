import { SERVER_NAME } from '../../../common/shared'
import { Owner } from '../../users/interfaces/owner.interface'
import { LOCK_DEPTH, LOCK_SCOPE, WEBDAV_APP_LOCK } from '../../webdav/constants/webdav'
import { COLLABORA_APP_LOCK } from '../modules/collabora-online/collabora-online.constants'
import { ONLY_OFFICE_APP_LOCK } from '../modules/only-office/only-office.constants'

export type LOCK_APP = typeof WEBDAV_APP_LOCK | typeof COLLABORA_APP_LOCK | typeof ONLY_OFFICE_APP_LOCK | typeof SERVER_NAME

// Optional lock parameters
export interface FileLockOptions {
  // Only locktype write is currently implemented in RFC
  lockRoot: string // Used with webdav (uri)
  lockToken: string
  lockScope: LOCK_SCOPE
  lockInfo?: string // Provided by some WebDAV clients to identify the locking application.
}

export interface FileLock {
  owner: Owner
  dbFilePath: string
  key: string
  depth: LOCK_DEPTH
  expiration: number
  app: LOCK_APP // Known application (internal)
  options?: FileLockOptions
}
