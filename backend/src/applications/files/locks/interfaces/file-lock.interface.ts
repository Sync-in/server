import type { SERVER_NAME } from '../../../../common/shared.js'
import type { Owner } from '../../../users/interfaces/owner.interface.js'
import type { LOCK_DEPTH, LOCK_SCOPE, WEBDAV_APP_LOCK } from '../../../webdav/constants/webdav.js'
import type { COLLABORA_APP_LOCK } from '../../editors/collabora-online/collabora-online.constants.js'
import type { EURO_OFFICE_APP_LOCK, ONLY_OFFICE_APP_LOCK } from '../../editors/only-office/only-office.constants.js'

export type LOCK_APP =
  typeof WEBDAV_APP_LOCK | typeof COLLABORA_APP_LOCK | typeof ONLY_OFFICE_APP_LOCK | typeof EURO_OFFICE_APP_LOCK | typeof SERVER_NAME

// Optional lock parameters
export interface FileLockOptions {
  // Only locktype write is currently implemented in RFC
  lockRoot: string | null // Used with webdav (uri)
  lockToken: string | null
  lockScope: LOCK_SCOPE
  lockInfo?: string // Provided by some WebDAV clients to identify the locking application.
}

export interface FileLockConflictOptions {
  userId?: number
  app?: LOCK_APP
  lockScope?: LOCK_SCOPE
  lockTokens?: string[]
}

export interface FileLock {
  lockId: string
  owner: Owner
  dbFilePath: string
  key: string
  depth: LOCK_DEPTH
  expiration: number
  app: LOCK_APP // Known application (internal)
  options?: FileLockOptions
}

export interface FileLockState {
  version: string
  locks: FileLock[]
}

export interface FileLockStateView {
  version: string | null
  locks: FileLock[]
}

export interface FileLockTransition<T> {
  result: T
  // Undefined means that the transition is read-only. An empty array removes
  // the exact-resource state through the same versioned CAS.
  nextLocks?: FileLock[]
}

// Keys use the Unicode-caseless NFC file-path identity.
export type FileLocksByName = Record<string, FileLock[]>

export interface FileLockDiscovery {
  root: FileLock[]
  children: FileLocksByName
}

export interface FileLockCleanupOptions {
  includeExact: boolean
  includeDescendants: boolean
}

export interface FileLockCleanup {
  remove(): Promise<void>
}
