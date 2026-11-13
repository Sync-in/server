import type { Availability } from '../../availability/availability.service.js'
import { RedisCacheAdapter } from './redis-cache.adapter.js'
import type { Mock } from 'vitest'

describe(RedisCacheAdapter.name, () => {
  let adapter: RedisCacheAdapter
  let evalMock: Mock

  beforeEach(() => {
    evalMock = vi.fn()
    adapter = new RedisCacheAdapter({ register: vi.fn() } as unknown as Availability)
    ;(adapter as any).client = { eval: evalMock }
  })

  it('reads one namespace snapshot from its sorted-set index without scanning Redis', async () => {
    const revisionKey = 'flock-revision|spaceId:1'
    const expectedKey = 'flock|spaceId:1|spaceExternalRootId:2|path:docs/file.txt|depth:0'
    evalMock.mockResolvedValue([
      '"revision-1"',
      'flock|spaceId:1|scope:native|path:base.txt|depth:0',
      '{"lockId":"base"}',
      expectedKey,
      `{"lockId":"external","key":"${expectedKey}"}`,
      'flock|spaceId:1|spaceExternalRootId:3|path:other.txt|depth:0',
      '{"lockId":"other"}'
    ])

    await expect(adapter.readRevisionSnapshot({ revisionKey, pattern: 'flock|spaceId:1|spaceExternalRootId:2|*' })).resolves.toEqual({
      revision: 'revision-1',
      entries: [{ key: expectedKey, value: { lockId: 'external', key: expectedKey } }]
    })

    expect(evalMock).toHaveBeenCalledWith(expect.stringContaining("redis.call('ZRANGE', KEYS[2], 0, -1)"), {
      keys: [revisionKey, `${revisionKey}|index`],
      arguments: ['1000']
    })
    expect(evalMock.mock.calls[0][0]).toContain("redis.call('ZREMRANGEBYSCORE', KEYS[2], 1, now)")
    expect(evalMock.mock.calls[0][0]).toContain("redis.call('MGET', unpack(indexedKeys))")
    expect(evalMock.mock.calls[0][0]).toContain("redis.call('PEXPIREAT', KEYS[2], lastEntry[2])")
    expect(evalMock.mock.calls[0][0]).toContain("redis.call('ZCARD', KEYS[2]) > tonumber(ARGV[1])")
    expect(evalMock.mock.calls[0][0]).toContain("redis.call('TYPE', KEYS[2]).ok")
    expect(evalMock.mock.calls[0][0]).not.toContain("redis.call('SCAN'")
  })

  it('updates the namespace index in the same Lua commit as the lock mutations', async () => {
    const revisionKey = 'flock-revision|ownerId:2'
    evalMock.mockResolvedValue(1)

    await expect(
      adapter.mutateRevision({
        revisionKey,
        mutations: [
          {
            type: 'set',
            key: 'flock|ownerId:2|scope:native|path:a.txt|depth:0',
            value: { lockId: 'new-lock' },
            ttl: 60,
            expect: 'present',
            expectedLockId: 'old-lock'
          },
          {
            type: 'delete',
            key: 'flock|ownerId:2|scope:native|path:b.txt|depth:0',
            expect: 'present',
            expectedLockId: 'deleted-lock'
          }
        ]
      })
    ).resolves.toBe(true)

    expect(evalMock).toHaveBeenCalledWith(expect.stringContaining("redis.call('ZADD', KEYS[2], expiresAt, mutation.key)"), {
      keys: [revisionKey, `${revisionKey}|index`],
      arguments: expect.any(Array)
    })
    const commitScript = evalMock.mock.calls[0][0] as string
    expect(commitScript).toContain("redis.call('ZREM', KEYS[2], mutation.key)")
    expect(commitScript).toContain("redis.call('PEXPIREAT', KEYS[2], lastEntry[2])")
    expect(commitScript).toContain('indexedCount > tonumber(ARGV[5])')
    expect(commitScript).toContain("redis.call('TYPE', KEYS[2]).ok")
    expect(commitScript.indexOf("redis.call('TYPE', KEYS[2]).ok")).toBeLessThan(commitScript.indexOf('local currentRevision'))
  })

  it('rejects an invalid indexed snapshot result', async () => {
    evalMock.mockResolvedValue(['"revision-1"', 'lock-without-value'])

    await expect(adapter.readRevisionSnapshot({ revisionKey: 'flock-revision|ownerId:2', pattern: 'flock|ownerId:2|*' })).rejects.toThrow(
      'Unexpected cache revision snapshot'
    )
  })

  it('rejects a mutation targeting the namespace index before executing Lua', async () => {
    const revisionKey = 'flock-revision|ownerId:2'

    await expect(
      adapter.mutateRevision({
        revisionKey,
        mutations: [{ type: 'delete', key: `${revisionKey}|index`, expect: 'present' }]
      })
    ).rejects.toThrow('cannot mutate its own namespace index')
    expect(evalMock).not.toHaveBeenCalled()
  })
})
