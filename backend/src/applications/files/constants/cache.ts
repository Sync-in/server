// cache task key = `ftask-$(userId}-${taskId}` => FileTask
export const CACHE_TASK_PREFIX = 'ftask' as const
// cache task cancellation key = `ftask-cancel-$(userId}-${taskId}` => boolean
export const CACHE_TASK_CANCEL_PREFIX = `${CACHE_TASK_PREFIX}-cancel` as const
// cache task user key = `ftask-user-$(userId}` => number of running FileTask
export const CACHE_TASK_USER_PREFIX = `${CACHE_TASK_PREFIX}-user` as const
export const CACHE_TASK_TTL = 86400 as const // one day
// cache lock key = `flock|(ownerId|spaceId|shareExternalId):${number}|<storage-scope>|path:${path}|depth:${depth}|token?:${uuid}` => FileLock
// storage scope = `scope:native` or the sorted external-scope identifiers
export const CACHE_LOCK_PREFIX = 'flock' as const
export const CACHE_LOCK_NATIVE_SCOPE_SEGMENT = 'scope:native' as const
// cache lock revision key = `flock-revision|(ownerId|spaceId|shareExternalId):${number}` => UUID
export const CACHE_LOCK_REVISION_PREFIX = `${CACHE_LOCK_PREFIX}-revision` as const
export const CACHE_LOCK_DEFAULT_TTL = 28800 as const // 8 hours in seconds
export const CACHE_LOCK_FILE_TTL = 3600 as const
// cache quota key = `(quota-user|quota-space)-${id}` => number
export const CACHE_QUOTA_PREFIX = 'quota' as const
export const CACHE_QUOTA_EVENT_UPDATE_PREFIX = 'event-update-quota' as const
export const CACHE_QUOTA_TTL = 86400 // 1 day
