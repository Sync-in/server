import crypto from 'node:crypto'
import { createLightSlug } from '../../common/shared.js'
import type { Cache } from '../../infrastructure/cache/cache.service.js'
import type { CacheRateLimitResult } from '../../infrastructure/cache/interfaces/cache-rate-limit.interface.js'
import { AUTH_PASSWORD_WORK_RATE_LIMIT_OPTIONS, AUTH_WEBDAV_RATE_LIMIT_OPTIONS } from '../constants/auth.js'
import { CACHE_AUTH_RATE_LIMIT_PREFIX } from '../constants/cache.js'

function hashTracker(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export function consumeRouteAuthRateLimit(
  cache: Cache,
  key: string,
  ttl: number,
  limit: number,
  blockDuration: number
): Promise<CacheRateLimitResult> {
  // Nest's key already contains the route, throttler name and client IP.
  return cache.consumeRateLimit(`${CACHE_AUTH_RATE_LIMIT_PREFIX}-${key}`, ttl, limit, blockDuration)
}

export function consumeWebDAVRateLimit(cache: Cache, ip: string): Promise<CacheRateLimitResult> {
  return cache.consumeRateLimit(
    `${CACHE_AUTH_RATE_LIMIT_PREFIX}-webdav-${hashTracker(ip)}`,
    AUTH_WEBDAV_RATE_LIMIT_OPTIONS.ttl,
    AUTH_WEBDAV_RATE_LIMIT_OPTIONS.limit,
    AUTH_WEBDAV_RATE_LIMIT_OPTIONS.blockDuration
  )
}

export function consumePasswordWorkRateLimit(cache: Cache, loginOrEmail: string): Promise<CacheRateLimitResult> {
  // This key must depend on the submitted identifier, never on whether a user was found.
  return cache.consumeRateLimit(
    `${CACHE_AUTH_RATE_LIMIT_PREFIX}-password-${hashTracker(createLightSlug(loginOrEmail))}`,
    AUTH_PASSWORD_WORK_RATE_LIMIT_OPTIONS.ttl,
    AUTH_PASSWORD_WORK_RATE_LIMIT_OPTIONS.limit,
    AUTH_PASSWORD_WORK_RATE_LIMIT_OPTIONS.blockDuration
  )
}
