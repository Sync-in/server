import crypto from 'node:crypto'
import { CACHE_AUTH_WEBDAV_PREFIX } from '../constants/cache.js'
import { genWebDAVAuthCacheKey } from './auth-cache.js'

describe('Authentication cache helpers', () => {
  const login = 'alice@example.com'
  const password = 'correct horse battery staple'
  const secret = 'access-token-secret'

  it('derives WebDAV cache keys with a domain-separated HMAC', () => {
    const cacheKey = genWebDAVAuthCacheKey(login, password, secret)
    const legacyCacheKey = `${CACHE_AUTH_WEBDAV_PREFIX}-${crypto.createHash('sha256').update(`${login}\u0000${password}`).digest('hex')}`

    expect(cacheKey).toMatch(/^auth-webdav-[a-f0-9]{64}$/)
    expect(cacheKey).toBe(genWebDAVAuthCacheKey(login, password, secret))
    expect(cacheKey).not.toBe(legacyCacheKey)
    expect(cacheKey).not.toBe(genWebDAVAuthCacheKey(login, password, 'another-access-token-secret'))
  })
})
