import { OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import type { CacheRateLimitResult } from './interfaces/cache-rate-limit.interface'

export abstract class Cache implements OnModuleInit, OnModuleDestroy {
  abstract defaultTTL: number
  abstract infiniteExpiration: number

  abstract onModuleInit(): void

  abstract onModuleDestroy(): void

  abstract has(key: string): Promise<boolean>

  /*
    pattern must use '*' as wildcard
   */
  abstract keys(pattern: string): Promise<string[]>

  abstract get(key: string): Promise<any>

  abstract mget(keys: string[]): Promise<any[]>

  abstract increment(key: string, amount?: number, ttl?: number, minimum?: number): Promise<number>

  // Atomically consumes a request; ttl and blockDuration are in milliseconds.
  abstract consumeRateLimit(key: string, ttl: number, limit: number, blockDuration: number): Promise<CacheRateLimitResult>

  /* ttl (seconds):
      - 0: infinite expiration
      - undefined: default ttl
  */
  abstract set(key: string, data: unknown, ttl?: number): Promise<boolean>

  abstract del(key: string): Promise<boolean>

  abstract mdel(keys: string[]): Promise<boolean>

  abstract genSlugKey(...args: any[]): string
}
