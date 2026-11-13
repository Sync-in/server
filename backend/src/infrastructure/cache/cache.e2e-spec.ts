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
  const revisionTestPrefix = `cache-revision-e2e-${randomUUID()}`

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

  it('should allow exactly one concurrent revision initialization', async () => {
    const revisionKey = `${revisionTestPrefix}:concurrent:revision`
    const lockKey = `${revisionTestPrefix}:concurrent:lock`
    const keys = [revisionKey, `${revisionKey}|index`, lockKey]
    await cache.mdel(keys)

    try {
      const results = await Promise.all([
        cache.commitRevision({
          revisionKey,
          expectedRevision: null,
          mutations: [{ type: 'set', key: lockKey, value: 'first', ttl: 0, expect: 'absent' }]
        }),
        cache.commitRevision({
          revisionKey,
          expectedRevision: null,
          mutations: [{ type: 'set', key: lockKey, value: 'second', ttl: 0, expect: 'absent' }]
        })
      ])

      expect(results.filter(Boolean)).toHaveLength(1)
      expect(results).toEqual(expect.arrayContaining([true, false]))
      expect(['first', 'second']).toContain(await cache.get(lockKey))
    } finally {
      await cache.mdel(keys)
    }
  })

  it('should reject a stale revision without applying mutations', async () => {
    const revisionKey = `${revisionTestPrefix}:stale:revision`
    const existingKey = `${revisionTestPrefix}:stale:existing`
    const newKey = `${revisionTestPrefix}:stale:new`
    const keys = [revisionKey, `${revisionKey}|index`, existingKey, newKey]
    await cache.mdel(keys)

    try {
      expect(
        await cache.commitRevision({
          revisionKey,
          expectedRevision: null,
          mutations: [{ type: 'set', key: existingKey, value: 'original', ttl: 0, expect: 'absent' }]
        })
      ).toBe(true)
      const revision = await cache.get(revisionKey)

      expect(
        await cache.commitRevision({
          revisionKey,
          expectedRevision: 'stale-revision',
          mutations: [
            { type: 'set', key: existingKey, value: 'changed', ttl: 0, expect: 'present' },
            { type: 'set', key: newKey, value: 'created', ttl: 0, expect: 'absent' }
          ]
        })
      ).toBe(false)
      expect(await cache.get(existingKey)).toBe('original')
      expect(await cache.get(newKey)).toBeUndefined()
      expect(await cache.get(revisionKey)).toBe(revision)
    } finally {
      await cache.mdel(keys)
    }
  })

  it('should read the revision and matching values from one coherent snapshot', async () => {
    const revisionKey = `${revisionTestPrefix}:snapshot:revision`
    const firstLockKey = `${revisionTestPrefix}:snapshot:lock:first`
    const secondLockKey = `${revisionTestPrefix}:snapshot:lock:second`
    const unrelatedKey = `${revisionTestPrefix}:snapshot:other`
    const keys = [revisionKey, `${revisionKey}|index`, firstLockKey, secondLockKey, unrelatedKey]
    await cache.mdel(keys)

    try {
      expect(
        await cache.commitRevision({
          revisionKey,
          expectedRevision: null,
          mutations: [
            { type: 'set', key: firstLockKey, value: { lockId: 'first' }, ttl: 0, expect: 'absent' },
            { type: 'set', key: secondLockKey, value: { lockId: 'second' }, ttl: 0, expect: 'absent' }
          ]
        })
      ).toBe(true)
      await cache.set(unrelatedKey, 'unrelated', 0)

      const snapshot = await cache.readRevisionSnapshot({ revisionKey, pattern: `${revisionTestPrefix}:snapshot:lock:*` })
      expect(snapshot.revision).toBe(await cache.get(revisionKey))
      expect(snapshot.entries).toHaveLength(2)
      expect(snapshot.entries).toEqual(
        expect.arrayContaining([
          { key: firstLockKey, value: { lockId: 'first' } },
          { key: secondLockKey, value: { lockId: 'second' } }
        ])
      )
    } finally {
      await cache.mdel(keys)
    }
  })

  it('should mutate a known lock and rotate its revision without a prior snapshot', async () => {
    const revisionKey = `${revisionTestPrefix}:known:revision`
    const lockKey = `${revisionTestPrefix}:known:lock`
    const keys = [revisionKey, `${revisionKey}|index`, lockKey]
    const initialLock = { lockId: 'known-lock', state: 'initial' }
    const refreshedLock = { ...initialLock, state: 'refreshed' }
    await cache.mdel(keys)

    try {
      expect(
        await cache.commitRevision({
          revisionKey,
          expectedRevision: null,
          mutations: [{ type: 'set', key: lockKey, value: initialLock, ttl: 0, expect: 'absent' }]
        })
      ).toBe(true)
      const firstRevision = await cache.get(revisionKey)

      expect(
        await cache.mutateRevision({
          revisionKey,
          mutations: [{ type: 'set', key: lockKey, value: refreshedLock, ttl: 0, expect: 'present', expectedLockId: initialLock.lockId }]
        })
      ).toBe(true)
      const secondRevision = await cache.get(revisionKey)
      expect(secondRevision).not.toBe(firstRevision)
      expect(await cache.get(lockKey)).toEqual(refreshedLock)

      expect(
        await cache.mutateRevision({
          revisionKey,
          mutations: [{ type: 'delete', key: lockKey, expect: 'present', expectedLockId: 'stale-lock' }]
        })
      ).toBe(false)
      expect(await cache.get(revisionKey)).toBe(secondRevision)
      expect(await cache.get(lockKey)).toEqual(refreshedLock)
    } finally {
      await cache.mdel(keys)
    }
  })

  it('should leave the whole revision batch unchanged when one precondition is invalid', async () => {
    const revisionKey = `${revisionTestPrefix}:precondition:revision`
    const existingKey = `${revisionTestPrefix}:precondition:a-existing`
    const missingKey = `${revisionTestPrefix}:precondition:z-missing`
    const keys = [revisionKey, `${revisionKey}|index`, existingKey, missingKey]
    await cache.mdel(keys)

    try {
      expect(
        await cache.commitRevision({
          revisionKey,
          expectedRevision: null,
          mutations: [{ type: 'set', key: existingKey, value: 'original', ttl: 0, expect: 'absent' }]
        })
      ).toBe(true)
      const revision = await cache.get(revisionKey)

      expect(
        await cache.commitRevision({
          revisionKey,
          expectedRevision: revision,
          mutations: [
            { type: 'set', key: existingKey, value: 'changed', ttl: 0, expect: 'present' },
            { type: 'set', key: missingKey, value: 'created', ttl: 0, expect: 'present' }
          ]
        })
      ).toBe(false)
      expect(await cache.get(existingKey)).toBe('original')
      expect(await cache.get(missingKey)).toBeUndefined()
      expect(await cache.get(revisionKey)).toBe(revision)
    } finally {
      await cache.mdel(keys)
    }
  })

  it('should protect a new lock incarnation with expectedLockId', async () => {
    const revisionKey = `${revisionTestPrefix}:lock-id:revision`
    const lockKey = `${revisionTestPrefix}:lock-id:lock`
    const keys = [revisionKey, `${revisionKey}|index`, lockKey]
    const oldLock = { lockId: 'old-lock', owner: 'first' }
    const newLock = { lockId: 'new-lock', owner: 'second' }
    await cache.mdel(keys)

    try {
      expect(
        await cache.commitRevision({
          revisionKey,
          expectedRevision: null,
          mutations: [{ type: 'set', key: lockKey, value: oldLock, ttl: 0, expect: 'absent' }]
        })
      ).toBe(true)
      const firstRevision = await cache.get(revisionKey)
      expect(
        await cache.commitRevision({
          revisionKey,
          expectedRevision: firstRevision,
          mutations: [
            {
              type: 'set',
              key: lockKey,
              value: newLock,
              ttl: 0,
              expect: 'present',
              expectedLockId: oldLock.lockId
            }
          ]
        })
      ).toBe(true)
      const secondRevision = await cache.get(revisionKey)

      expect(
        await cache.commitRevision({
          revisionKey,
          expectedRevision: secondRevision,
          mutations: [{ type: 'delete', key: lockKey, expect: 'present', expectedLockId: oldLock.lockId }]
        })
      ).toBe(false)
      expect(await cache.get(lockKey)).toEqual(newLock)
      expect(await cache.get(revisionKey)).toBe(secondRevision)
    } finally {
      await cache.mdel(keys)
    }
  })

  it('should keep the revision sidecar readable and persistent after deleting a value', async () => {
    const revisionKey = `${revisionTestPrefix}:delete:revision`
    const lockKey = `${revisionTestPrefix}:delete:lock`
    const keys = [revisionKey, `${revisionKey}|index`, lockKey]
    const lock = { lockId: 'deleted-lock' }
    await cache.mdel(keys)

    try {
      expect(
        await cache.commitRevision({
          revisionKey,
          expectedRevision: null,
          mutations: [{ type: 'set', key: lockKey, value: lock, ttl: 1, expect: 'absent' }]
        })
      ).toBe(true)
      const firstRevision = await cache.get(revisionKey)
      expect(
        await cache.commitRevision({
          revisionKey,
          expectedRevision: firstRevision,
          mutations: [{ type: 'delete', key: lockKey, expect: 'present', expectedLockId: lock.lockId }]
        })
      ).toBe(true)
      const secondRevision = await cache.get(revisionKey)

      expect(await cache.get(lockKey)).toBeUndefined()
      expect(secondRevision).toEqual(expect.any(String))
      expect(secondRevision).not.toBe(firstRevision)
      await setTimeout(1_100)
      expect(await cache.get(revisionKey)).toBe(secondRevision)
    } finally {
      await cache.mdel(keys)
    }
  })

  it('should expire a finite namespace index with its last lock', async () => {
    const revisionKey = `${revisionTestPrefix}:expiration:revision`
    const lockKey = `${revisionTestPrefix}:expiration:lock`
    const keys = [revisionKey, `${revisionKey}|index`, lockKey]
    await cache.mdel(keys)

    try {
      expect(
        await cache.commitRevision({
          revisionKey,
          expectedRevision: null,
          mutations: [{ type: 'set', key: lockKey, value: { lockId: 'expiring-lock' }, ttl: 1, expect: 'absent' }]
        })
      ).toBe(true)

      // MySQL rounds cache expirations up to whole seconds, so a one-second TTL can remain visible for almost two seconds.
      await setTimeout(2_100)
      expect(await cache.get(lockKey)).toBeUndefined()
      expect(await cache.has(`${revisionKey}|index`)).toBe(false)
      expect(await cache.get(revisionKey)).toEqual(expect.any(String))
    } finally {
      await cache.mdel(keys)
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
