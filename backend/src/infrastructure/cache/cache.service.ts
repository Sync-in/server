import { OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import type { CacheRateLimitResult } from './interfaces/cache-rate-limit.interface.js'
import type { CacheCompareAndSwapCommand } from './interfaces/cache-compare-and-swap.interface.js'

export function validateCacheCompareAndSwapCommand(command: CacheCompareAndSwapCommand, defaultTTL: number): void {
  if (typeof command.key !== 'string' || command.key.length === 0) {
    throw new TypeError('Invalid cache compare-and-swap key')
  }
  if (command.expectedVersion !== null && typeof command.expectedVersion !== 'string') {
    throw new TypeError('Invalid cache compare-and-swap expected version')
  }
  if (command.value === undefined) return
  if (
    command.value === null ||
    typeof command.value !== 'object' ||
    Array.isArray(command.value) ||
    typeof (command.value as { version?: unknown }).version !== 'string'
  ) {
    throw new TypeError('A cache compare-and-swap value must be an object with a string version')
  }
  const ttl = command.ttl ?? defaultTTL
  if (!Number.isSafeInteger(ttl) || ttl < 0) throw new RangeError('Invalid cache compare-and-swap TTL')
}

export abstract class Cache implements OnModuleInit, OnModuleDestroy {
  abstract defaultTTL: number
  abstract infiniteExpiration: number

  abstract onModuleInit(): void

  abstract onModuleDestroy(): void

  abstract has(key: string): Promise<boolean>

  /*
    pattern supports only '*' as wildcard; each matching key is returned once
   */
  abstract keys(pattern: string): Promise<string[]>

  abstract get(key: string): Promise<any>

  /*
    values preserve the requested key order; missing keys return undefined
   */
  abstract mget(keys: string[]): Promise<any[]>

  abstract increment(key: string, amount?: number, ttl?: number, minimum?: number): Promise<number>

  // Atomically consumes a request; ttl and blockDuration are in milliseconds.
  abstract consumeRateLimit(key: string, ttl: number, limit: number, blockDuration: number): Promise<CacheRateLimitResult>

  // Atomically writes or deletes one key when its current version matches the expected version.
  abstract compareAndSwap(command: CacheCompareAndSwapCommand): Promise<boolean>

  /* ttl (seconds):
      - 0: infinite expiration
      - undefined: default ttl
  */
  abstract set(key: string, data: unknown, ttl?: number): Promise<boolean>

  abstract del(key: string): Promise<boolean>

  /*
    returns true when at least one key was deleted
   */
  abstract mdel(keys: string[]): Promise<boolean>

  abstract genSlugKey(...args: any[]): string
}
