// cache key = `auth-webdav-${sha256(login + '\0' + password)}` => successful UserModel only
export const CACHE_AUTH_WEBDAV_PREFIX = 'auth-webdav' as const
export const CACHE_AUTH_WEBDAV_TTL = 900 as const
export const CACHE_AUTH_RATE_LIMIT_PREFIX = 'auth-rate-limit' as const
