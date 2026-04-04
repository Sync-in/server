// cache task key = `ftask-$(userId}-${taskId}` => FileTask
export const CACHE_TASK_PREFIX = 'ftask' as const
export const CACHE_TASK_TTL = 86400 as const // one day
// cache token key = `flock|token?:${uuid}|path:${path}|ownerId?:${number}|spaceId?:${number}|...props` => FileLock
export const CACHE_LOCK_PREFIX = 'flock' as const
export const CACHE_LOCK_DEFAULT_TTL = 28800 as const // 8 hours in seconds
export const CACHE_LOCK_FILE_TTL = 3600 as const
// cache quota key = `(quota-user|quota-space)-${id}` => number
export const CACHE_QUOTA_PREFIX = 'quota' as const
export const CACHE_QUOTA_EVENT_UPDATE_PREFIX = 'event-update-quota' as const
export const CACHE_QUOTA_TTL = 86400 // 1 day
