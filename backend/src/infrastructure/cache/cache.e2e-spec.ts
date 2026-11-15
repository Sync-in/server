import { Test, TestingModule } from '@nestjs/testing'
import { LoggerModule } from 'nestjs-pino'
import { randomUUID } from 'node:crypto'
import { setTimeout } from 'node:timers/promises'
import { AvailabilityModule } from '../availability/availability.module.js'
import { DatabaseModule } from '../database/database.module.js'
import { SchedulerModule } from '../scheduler/scheduler.module.js'
import { CacheModule } from './cache.module.js'
import { Cache } from './cache.service.js'

describe(Cache.name, () => {
  let module: TestingModule
  let cache: Cache
  const compareAndSwapTestPrefix = `cache-cas-e2e-${randomUUID()}`

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [AvailabilityModule, SchedulerModule, CacheModule, LoggerModule.forRoot(), DatabaseModule]
    }).compile()

    module.useLogger(['fatal'])
    cache = module.get<Cache>(Cache)
    await cache.onModuleInit()
  })

  afterAll(async () => {
    await module.close()
  })

  it('should be defined', () => {
    expect(cache).toBeDefined()
  })

  it('should create the key & value', async () => {
    expect(await cache.set('foo', 'bar')).toBe(true)
    expect(await cache.set('undefined', undefined)).toBe(true)
  })

  it('should get all keys defined', async () => {
    expect(await cache.keys('*')).toEqual(expect.arrayContaining(['foo', 'undefined']))
  })

  it('should has (or not) the key', async () => {
    expect(await cache.has('bar')).toBe(false)
    expect(await cache.has('fo')).toBe(false)
    expect(await cache.has('foo')).toBe(true)
    expect(await cache.has('undefined')).toBe(true)
  })

  it('should get value from key', async () => {
    expect(await cache.get('foo')).toBe('bar')
    expect(await cache.get('undefined')).toBeNull()
    expect(await cache.get('unknown')).toBeUndefined()
  })

  it('should get values from keys', async () => {
    const values = await cache.mget(['foo', 'undefined'])
    expect(values).toHaveLength(2)
    expect(values[0]).toBe('bar')
    expect(values[1]).toBeNull()
  })

  it('should preserve key order and missing entries when getting multiple values', async () => {
    await cache.set('ordered-first', 'first')
    await cache.set('ordered-second', 'second')

    expect(await cache.mget(['ordered-second', 'ordered-missing', 'ordered-first'])).toEqual(['second', undefined, 'first'])
    expect(await cache.mget([])).toEqual([])

    await cache.mdel(['ordered-first', 'ordered-second'])
  })

  it('should delete the key', async () => {
    expect(await cache.del('foo')).toBe(true)
    expect(await cache.has('foo')).toBe(false)
    expect(await cache.del('undefined')).toBe(true)
    expect(await cache.get('foo')).toBeUndefined()
    expect(await cache.del('unknown')).toBe(false)
  })

  it('should search & delete multiple keys', async () => {
    expect(await cache.set('foo', 'bar')).toBe(true)
    expect(await cache.set('foo2', 'bar2')).toBe(true)
    expect(await cache.keys('foo*')).toEqual(expect.arrayContaining(['foo', 'foo2']))
    expect(await cache.mdel(['foo', 'foo2'])).toBe(true)
    expect(await cache.keys('foo*')).toHaveLength(0)
  })

  it('should report whether at least one key was deleted', async () => {
    await cache.set('delete-existing', true)

    expect(await cache.mdel(['delete-existing', 'delete-missing'])).toBe(true)
    expect(await cache.mdel(['delete-missing'])).toBe(false)
    expect(await cache.mdel([])).toBe(false)
  })

  it('should only use asterisks as key pattern wildcards', async () => {
    const keys = ['pattern_1', 'pattern%2', 'pattern[3]', 'pattern3', 'pattern?', 'pattern=4', 'pattern\\5']
    for (const key of keys) {
      await cache.set(key, true)
    }

    expect(await cache.keys('pattern_*')).toEqual(['pattern_1'])
    expect(await cache.keys('pattern%*')).toEqual(['pattern%2'])
    expect(await cache.keys('pattern[3]')).toEqual(['pattern[3]'])
    expect(await cache.keys('pattern?')).toEqual(['pattern?'])
    expect(await cache.keys('pattern=4')).toEqual(['pattern=4'])
    expect(await cache.keys('pattern\\5')).toEqual(['pattern\\5'])

    await cache.mdel(keys)
  })

  it('should create the key & value with a TTL', async () => {
    expect(await cache.set('foo', 'bar', 1)).toBe(true)
    expect(await cache.get('foo')).toBe('bar')
    await setTimeout(2000)
    expect(await cache.has('foo')).toBe(false)
    expect(await cache.get('foo')).toBeUndefined()
  })

  it('should create a key without expiration', async () => {
    expect(await cache.set('persistent', 'value', 0)).toBe(true)
    expect(await cache.get('persistent')).toBe('value')
    await cache.del('persistent')
  })

  it('should allow exactly one concurrent compare-and-swap initialization', async () => {
    const key = `${compareAndSwapTestPrefix}:concurrent`
    await cache.del(key)

    try {
      const results = await Promise.all([
        cache.compareAndSwap({ key, expectedVersion: null, value: { version: 'version-1', value: 'first' }, ttl: 0 }),
        cache.compareAndSwap({ key, expectedVersion: null, value: { version: 'version-2', value: 'second' }, ttl: 0 })
      ])

      expect(results.filter(Boolean)).toHaveLength(1)
      expect(results).toEqual(expect.arrayContaining([true, false]))
      expect(['first', 'second']).toContain((await cache.get(key)).value)
    } finally {
      await cache.del(key)
    }
  })

  it('should reject a stale version without changing the value', async () => {
    const key = `${compareAndSwapTestPrefix}:stale`
    const initialValue = { version: 'version-1', value: 'initial' }
    await cache.del(key)

    try {
      expect(await cache.compareAndSwap({ key, expectedVersion: null, value: initialValue, ttl: 0 })).toBe(true)
      expect(
        await cache.compareAndSwap({
          key,
          expectedVersion: 'stale-version',
          value: { version: 'version-2', value: 'changed' },
          ttl: 0
        })
      ).toBe(false)
      expect(await cache.get(key)).toEqual(initialValue)
    } finally {
      await cache.del(key)
    }
  })

  it('should update and delete only when the embedded version matches', async () => {
    const key = `${compareAndSwapTestPrefix}:lifecycle`
    await cache.del(key)

    try {
      expect(await cache.compareAndSwap({ key, expectedVersion: null, value: { version: 'version-1', locks: [] }, ttl: 0 })).toBe(true)
      expect(
        await cache.compareAndSwap({
          key,
          expectedVersion: 'version-1',
          value: { version: 'version-2', locks: [{ lockId: 'lock-1' }] },
          ttl: 0
        })
      ).toBe(true)
      expect(await cache.compareAndSwap({ key, expectedVersion: 'version-1' })).toBe(false)
      expect(await cache.compareAndSwap({ key, expectedVersion: 'version-2' })).toBe(true)
      expect(await cache.get(key)).toBeUndefined()
    } finally {
      await cache.del(key)
    }
  })

  it('should treat an expired value as absent', async () => {
    const key = `${compareAndSwapTestPrefix}:expired`
    await cache.del(key)

    try {
      expect(await cache.compareAndSwap({ key, expectedVersion: null, value: { version: 'expired-version' }, ttl: 1 })).toBe(true)
      await setTimeout(2_100)
      expect(await cache.compareAndSwap({ key, expectedVersion: null, value: { version: 'new-version' }, ttl: 0 })).toBe(true)
      expect(await cache.get(key)).toEqual({ version: 'new-version' })
    } finally {
      await cache.del(key)
    }
  })

  it('should create a slug key from parameters', () => {
    expect(cache.genSlugKey('foo', 'BAR', 12341)).toBe('foo:bar:12341')
  })

  it('should consume, block and reset a rate limit', async () => {
    const key = 'rate-limit-test'
    await cache.del(key)

    expect(await cache.consumeRateLimit(key, 5_000, 2, 1_000)).toMatchObject({ totalHits: 1, isBlocked: false })
    expect(await cache.consumeRateLimit(key, 5_000, 2, 1_000)).toMatchObject({ totalHits: 2, isBlocked: false })
    expect(await cache.consumeRateLimit(key, 5_000, 2, 1_000)).toMatchObject({ totalHits: 3, isBlocked: true })

    // Blocked requests neither add hits nor extend the block duration.
    expect(await cache.consumeRateLimit(key, 5_000, 2, 1_000)).toMatchObject({ totalHits: 3, isBlocked: true })
    await setTimeout(1_100)
    expect(await cache.consumeRateLimit(key, 5_000, 2, 1_000)).toMatchObject({ totalHits: 1, isBlocked: false })

    await cache.del(key)
  })
})
