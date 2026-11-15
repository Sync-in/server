import type { Availability } from '../../availability/availability.service.js'
import { RedisCacheAdapter } from './redis-cache.adapter.js'

describe(RedisCacheAdapter.name, () => {
  let adapter: RedisCacheAdapter
  let evalMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    evalMock = vi.fn()
    adapter = new RedisCacheAdapter({ register: vi.fn() } as unknown as Availability)
    ;(adapter as any).client = { eval: evalMock }
  })

  it('deduplicates keys returned by Redis scan', async () => {
    const scanIterator = vi.fn().mockReturnValue(
      (async function* () {
        yield ['lock:1', 'lock:2']
        yield ['lock:1', 'lock:3']
      })()
    )
    ;(adapter as any).client.scanIterator = scanIterator

    await expect(adapter.keys('lock:*')).resolves.toEqual(['lock:1', 'lock:2', 'lock:3'])
    expect(scanIterator).toHaveBeenCalledWith({ MATCH: 'lock:*', COUNT: 100 })
  })

  it('compares the embedded version and writes the same key atomically', async () => {
    evalMock.mockResolvedValue(1)
    const value = { version: 'version-2', locks: [{ lockId: 'lock-1' }] }

    await expect(adapter.compareAndSwap({ key: 'lock-state', expectedVersion: 'version-1', value, ttl: 60 })).resolves.toBe(true)

    const script = evalMock.mock.calls[0][0] as string
    expect(script).toContain("redis.call('GET', KEYS[1])")
    expect(script).toContain('current.version ~= ARGV[2]')
    expect(script).toContain("redis.call('SET', KEYS[1], ARGV[4], 'EX', ARGV[5])")
    expect(evalMock).toHaveBeenCalledWith(script, {
      keys: ['lock-state'],
      arguments: ['match', 'version-1', 'set', JSON.stringify(value), '60']
    })
  })

  it('creates only when the key is absent and supports persistent values', async () => {
    evalMock.mockResolvedValue(0)
    const value = { version: 'version-1', locks: [] }

    await expect(adapter.compareAndSwap({ key: 'lock-state', expectedVersion: null, value, ttl: 0 })).resolves.toBe(false)

    const script = evalMock.mock.calls[0][0] as string
    expect(script).toContain('if currentValue ~= false then')
    expect(script).toContain("redis.call('SET', KEYS[1], ARGV[4])")
    expect(evalMock.mock.calls[0][1]).toEqual({
      keys: ['lock-state'],
      arguments: ['absent', '', 'set', JSON.stringify(value), '-1']
    })
  })

  it('deletes only after the expected version matches', async () => {
    evalMock.mockResolvedValue(1)

    await expect(adapter.compareAndSwap({ key: 'lock-state', expectedVersion: 'version-1' })).resolves.toBe(true)

    const script = evalMock.mock.calls[0][0] as string
    expect(script).toContain("redis.call('UNLINK', KEYS[1])")
    expect(evalMock.mock.calls[0][1]).toEqual({
      keys: ['lock-state'],
      arguments: ['match', 'version-1', 'delete', '', '']
    })
  })

  it('rejects invalid values and TTLs before executing Lua', async () => {
    await expect(adapter.compareAndSwap({ key: 'lock-state', expectedVersion: null, value: { locks: [] }, ttl: 60 })).rejects.toThrow(
      'object with a string version'
    )
    await expect(adapter.compareAndSwap({ key: 'lock-state', expectedVersion: null, value: { version: 'version-1' }, ttl: -1 })).rejects.toThrow(
      'Invalid cache compare-and-swap TTL'
    )
    expect(evalMock).not.toHaveBeenCalled()
  })

  it('rejects an unexpected Lua result', async () => {
    evalMock.mockResolvedValue('unexpected')

    await expect(adapter.compareAndSwap({ key: 'lock-state', expectedVersion: null, value: { version: 'version-1' } })).rejects.toThrow(
      'Unexpected cache compare-and-swap result'
    )
  })
})
