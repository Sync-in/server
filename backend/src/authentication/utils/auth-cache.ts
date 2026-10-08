import crypto from 'node:crypto'
import { CACHE_AUTH_WEBDAV_PREFIX } from '../constants/cache.js'

const WEBDAV_AUTH_CACHE_HMAC_CONTEXT = 'sync-in:webdav-auth-cache:v1'

export function genWebDAVAuthCacheKey(loginOrEmail: string, password: string, secret: string): string {
  // Keep this HMAC domain separate from JWT signatures that use the same configured secret.
  const digest = crypto
    .createHmac('sha256', secret)
    .update(WEBDAV_AUTH_CACHE_HMAC_CONTEXT)
    .update('\u0000')
    .update(loginOrEmail)
    .update('\u0000')
    .update(password)
    .digest('hex')

  return `${CACHE_AUTH_WEBDAV_PREFIX}-${digest}`
}
