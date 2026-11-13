import { OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import type { CacheRateLimitResult } from './interfaces/cache-rate-limit.interface.js'
import {
  CACHE_REVISION_MAX_MUTATIONS,
  type CacheRevisionCommit,
  type CacheRevisionMutationCommit,
  type CacheRevisionSnapshot,
  type CacheRevisionSnapshotCommand
} from './interfaces/cache-revision.interface.js'

export function validateCacheRevisionCommand(command: CacheRevisionMutationCommit, defaultTTL: number, reservedKey?: string): void {
  const { mutations } = command
  if (mutations.length > CACHE_REVISION_MAX_MUTATIONS) {
    throw new Error(`A cache revision cannot exceed ${CACHE_REVISION_MAX_MUTATIONS} mutations`)
  }
  const keys = new Set<string>()
  for (const mutation of mutations) {
    if (mutation.key === command.revisionKey) throw new Error('A cache revision cannot mutate its own sidecar key')
    if (mutation.key === reservedKey) throw new Error('A cache revision cannot mutate its own namespace index')
    if (keys.has(mutation.key)) throw new Error(`Duplicate cache revision mutation for key: ${mutation.key}`)
    keys.add(mutation.key)
    if (mutation.type === 'set') {
      const ttl = mutation.ttl ?? defaultTTL
      if (!Number.isSafeInteger(ttl) || ttl < 0) throw new RangeError(`Invalid cache revision mutation TTL for key: ${mutation.key}`)
    }
    if (mutation.expect === 'absent' && mutation.expectedLockId !== undefined) {
      throw new Error('expectedLockId requires a present cache revision mutation')
    }
  }
}

export abstract class Cache implements OnModuleInit, OnModuleDestroy {
  abstract defaultTTL: number
  abstract infiniteExpiration: number

  abstract onModuleInit(): void

  abstract onModuleDestroy(): void

  abstract has(key: string): Promise<boolean>

  /*
    pattern supports only '*' as wildcard
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

  // Rotates the persistent sidecar and applies the complete mutation batch atomically, after all preconditions pass.
  abstract commitRevision(command: CacheRevisionCommit): Promise<boolean>

  // Reads the sidecar and matching entries from one coherent backend snapshot.
  abstract readRevisionSnapshot(command: CacheRevisionSnapshotCommand): Promise<CacheRevisionSnapshot>

  // Rotates the sidecar and applies known-key mutations without requiring a previously read revision.
  abstract mutateRevision(command: CacheRevisionMutationCommit): Promise<boolean>

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
