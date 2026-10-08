// cache key = `auth-webdav-${HMAC-SHA-256(context + '\0' + login + '\0' + password, access-token secret)}` => successful UserModel only
export const CACHE_AUTH_WEBDAV_PREFIX = 'auth-webdav' as const
export const CACHE_AUTH_RATE_LIMIT_PREFIX = 'auth-rate-limit' as const
