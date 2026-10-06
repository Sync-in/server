import { ThrottlerStorage } from '@nestjs/throttler'
import { Cache } from '../../infrastructure/cache/cache.service.js'
import type { CacheRateLimitResult } from '../../infrastructure/cache/interfaces/cache-rate-limit.interface.js'
import { consumeRouteAuthRateLimit } from '../utils/auth-rate-limit.js'

export class AuthRateLimitStorage implements ThrottlerStorage {
  constructor(private readonly cache: Cache) {}

  increment(key: string, ttl: number, limit: number, blockDuration: number): Promise<CacheRateLimitResult> {
    return consumeRouteAuthRateLimit(this.cache, key, ttl, limit, blockDuration)
  }
}
