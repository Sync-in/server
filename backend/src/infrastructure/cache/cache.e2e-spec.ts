import { Test, TestingModule } from '@nestjs/testing'
import { LoggerModule } from 'nestjs-pino'
import { setTimeout } from 'node:timers/promises'
import { DatabaseModule } from '../database/database.module'
import { CacheModule } from './cache.module'
import { Cache } from './services/cache.service'

describe(Cache.name, () => {
  let module: TestingModule
  let cache: Cache

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [CacheModule, LoggerModule.forRoot(), DatabaseModule]
    }).compile()

    module.useLogger(['fatal'])
    cache = module.get<Cache>(Cache)
    cache.onModuleInit()
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

  it('should create the key & value with a TTL', async () => {
    expect(await cache.set('foo', 'bar', 1)).toBe(true)
    expect(await cache.get('foo')).toBe('bar')
    await setTimeout(2000)
    expect(await cache.has('foo')).toBe(false)
    expect(await cache.get('foo')).toBeUndefined()
  })

  it('should create a slug key from parameters', () => {
    expect(cache.genSlugKey('foo', 'BAR', 12341)).toBe('foo-bar-12341')
  })

  // it('should exit if maxConnectRetry is reached', () => {
  //   const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
  //     throw new Error('process.exit')
  //   })
  //   expect(() => RedisCache.redisReconnectStrategy(RedisCache.redisReconnectOptions.maxAttempts + 1)).toThrow()
  //   expect(mockExit).toHaveBeenCalledTimes(1)
  //   mockExit.mockRestore()
  // })
  //
  // it('should not exit if maxConnectRetry is not reached', () => {
  //   expect(RedisCache.redisReconnectStrategy(1)).toBeGreaterThan(0)
  // })
})
