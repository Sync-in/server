import { SERVER_NAME } from '../../../common/shared.js'
import { Owner } from '../../users/interfaces/owner.interface.js'
import { LOCK_DEPTH, LOCK_SCOPE, WEBDAV_APP_LOCK } from '../../webdav/constants/webdav.js'
import { COLLABORA_APP_LOCK } from '../editors/collabora-online/collabora-online.constants.js'
import { EURO_OFFICE_APP_LOCK, ONLY_OFFICE_APP_LOCK } from '../editors/only-office/only-office.constants.js'

export type LOCK_APP =
  typeof WEBDAV_APP_LOCK | typeof COLLABORA_APP_LOCK | typeof ONLY_OFFICE_APP_LOCK | typeof EURO_OFFICE_APP_LOCK | typeof SERVER_NAME

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
