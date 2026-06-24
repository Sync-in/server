// cache key = `auth-webdav-${sha256(login + password)}` => UserModel | null
export const CACHE_AUTH_WEBDAV_PREFIX = 'auth-webdav' as const
export const CACHE_AUTH_WEBDAV_TTL = 900 as const
