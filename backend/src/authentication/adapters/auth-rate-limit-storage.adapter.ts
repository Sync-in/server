import { ThrottlerStorage } from '@nestjs/throttler'
import { Cache } from '../../infrastructure/cache/cache.service'
import type { CacheRateLimitResult } from '../../infrastructure/cache/interfaces/cache-rate-limit.interface'
import { consumeRouteAuthRateLimit } from '../utils/auth-rate-limit'

export class AuthRateLimitStorage implements ThrottlerStorage {
  constructor(private readonly cache: Cache) {}

  increment(key: string, ttl: number, limit: number, blockDuration: number): Promise<CacheRateLimitResult> {
    return consumeRouteAuthRateLimit(this.cache, key, ttl, limit, blockDuration)
  }
}
