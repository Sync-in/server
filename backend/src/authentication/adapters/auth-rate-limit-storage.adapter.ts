import { ThrottlerStorage } from '@nestjs/throttler'
import { Cache } from '../../infrastructure/cache/cache.service'
import type { CacheRateLimitResult } from '../../infrastructure/cache/interfaces/cache-rate-limit.interface'
import { CACHE_AUTH_RATE_LIMIT_PREFIX } from '../constants/cache'

export class AuthRateLimitStorage implements ThrottlerStorage {
  constructor(private readonly cache: Cache) {}

  increment(key: string, ttl: number, limit: number, blockDuration: number): Promise<CacheRateLimitResult> {
    // Nest already includes the route, throttler name and client tracker in its hashed key.
    return this.cache.consumeRateLimit(`${CACHE_AUTH_RATE_LIMIT_PREFIX}-${key}`, ttl, limit, blockDuration)
  }
}
