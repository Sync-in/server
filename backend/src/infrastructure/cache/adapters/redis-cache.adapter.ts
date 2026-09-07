import { Injectable, Logger } from '@nestjs/common'
import { RedisClientOptions } from '@redis/client'
import { createClient, RedisClientType } from 'redis'
import { createCacheKeySlug } from '../../../common/shared'
import { configuration } from '../../../configuration/config.environment'
import { redactRedisUrl } from '../../utils'
import { Cache } from '../cache.service'
import type { CacheRateLimitResult } from '../interfaces/cache-rate-limit.interface'

@Injectable()
export class RedisCacheAdapter implements Cache {
  defaultTTL: number = configuration.cache.ttl
  infiniteExpiration = -1
  private readonly logger = new Logger(Cache.name.toUpperCase())
  private readonly client: RedisClientType
  private readonly redactedRedisUrl = redactRedisUrl(configuration.cache.redis)
  private readonly reconnectOptions = { maxAttempts: 3, minConnectDelay: 1000, maxConnectDelay: 2000 }

  constructor() {
    this.client = createClient({
      url: configuration.cache.redis,
      socket: { noDelay: true, reconnectStrategy: this.reconnectStrategy }
    } satisfies RedisClientOptions)
  }

  async onModuleInit() {
    this.client.on('error', (e: Error) => this.logger.error(e.message || e))
    this.client.on('ready', () => this.logger.log(`Connected to Redis Server at ${this.redactedRedisUrl}`))
    this.client.connect().catch((e: Error) => this.logger.error(e))
  }

  async onModuleDestroy() {
    if (this.client?.isOpen) {
      await this.client.close()
    }
  }

  async has(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1
  }

  async keys(pattern: string): Promise<string[]> {
    const matches: string[] = []
    for await (const keys of this.client.scanIterator({ MATCH: this.toGlobPattern(pattern), COUNT: 100 })) {
      matches.push(...keys)
    }
    return matches
  }

  async get(key: string): Promise<any> {
    return this.deserialize(await this.client.get(key))
  }

  async mget(keys: string[]): Promise<(any | undefined)[]> {
    if (!keys.length) return []
    return (await this.client.mGet(keys)).map((v) => this.deserialize(v))
  }

  async increment(key: string, amount = 1, ttl?: number, minimum?: number): Promise<number> {
    const exp = this.getTTL(ttl)
    if (minimum !== undefined) {
      const value = await this.client.eval(
        `local value = redis.call('INCRBY', KEYS[1], ARGV[1])
         if value < tonumber(ARGV[2]) then
           value = tonumber(ARGV[2])
           redis.call('SET', KEYS[1], value)
         end
         if tonumber(ARGV[3]) == -1 then
           redis.call('PERSIST', KEYS[1])
         else
           redis.call('EXPIRE', KEYS[1], ARGV[3])
         end
         return value`,
        { keys: [key], arguments: [String(amount), String(minimum), String(exp)] }
      )
      return Number(value)
    }
    const multi = this.client.multi()
    multi.incrBy(key, amount)
    if (exp === this.infiniteExpiration) {
      multi.persist(key)
    } else {
      multi.expire(key, exp)
    }
    const [value] = await multi.exec()
    return Number(value)
  }

  async consumeRateLimit(key: string, ttl: number, limit: number, blockDuration: number): Promise<CacheRateLimitResult> {
    // Keep the complete state transition atomic and use Redis time across workers.
    const result = (await this.client.eval(
      `local time = redis.call('TIME')
       local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
       local ttl = tonumber(ARGV[1])
       local limit = tonumber(ARGV[2])
       local blockDuration = tonumber(ARGV[3])
       local value = redis.call('GET', KEYS[1])
       local state = value and cjson.decode(value) or { hits = {}, blockExpiresAt = 0 }

       -- A completed block starts a fresh window.
       if state.blockExpiresAt > 0 and state.blockExpiresAt <= now then
         state.hits = {}
         state.blockExpiresAt = 0
       end
       -- Keep only the hits that remain in the sliding window.
       local hits = {}
       for _, expiresAt in ipairs(state.hits) do
         if expiresAt > now then
           table.insert(hits, expiresAt)
         end
       end
       state.hits = hits
       -- Requests received during a block do not extend it.
       if state.blockExpiresAt == 0 then
         table.insert(hits, now + ttl)
         if #hits > limit then
           state.blockExpiresAt = now + blockDuration
         end
       end

       local expiration = state.blockExpiresAt
       for _, expiresAt in ipairs(hits) do
         expiration = math.max(expiration, expiresAt)
       end
       redis.call('SET', KEYS[1], cjson.encode(state), 'PXAT', expiration)
       return { #hits, math.max(0, math.ceil(((hits[1] or now) - now) / 1000)), state.blockExpiresAt > now and 1 or 0,
         math.max(0, math.ceil((state.blockExpiresAt - now) / 1000)) }`,
      { keys: [key], arguments: [String(ttl), String(limit), String(blockDuration)] }
    )) as number[]

    return { totalHits: result[0], timeToExpire: result[1], isBlocked: result[2] === 1, timeToBlockExpire: result[3] }
  }

  async set(key: string, data: unknown, ttl?: number): Promise<boolean> {
    const exp = this.getTTL(ttl)
    const options = exp === this.infiniteExpiration ? {} : { expiration: { type: 'EX' as const, value: exp } }
    try {
      return (await this.client.set(key, this.serialize(data), options)) === 'OK'
    } catch (e) {
      this.logger.error({ tag: this.set.name, msg: `${e}` })
      return false
    }
  }

  async del(key: any): Promise<boolean> {
    return (await this.client.unlink(key)) > 0
  }

  async mdel(keys: string[]): Promise<boolean> {
    if (!keys.length) return false
    const multi = this.client.multi()
    for (const key of keys) {
      multi.unlink(key)
    }
    const res = await multi.exec()
    return Array.isArray(res) && res.some((r) => typeof r === 'number' && r > 0)
  }

  genSlugKey(...args: any[]): string {
    return createCacheKeySlug(args)
  }

  private readonly reconnectStrategy = (attempts: number): number => {
    if (attempts > this.reconnectOptions.maxAttempts) {
      this.logger.error('Too many retries on Redis server. Exiting')
      process.exit()
    } else {
      const wait: number = Math.min(this.reconnectOptions.minConnectDelay * Math.pow(2, attempts), this.reconnectOptions.maxConnectDelay)
      this.logger.warn(`Retrying connection to Redis server in ${wait / 1000}s`)
      return wait
    }
  }

  private getTTL(ttl: number): number {
    /* ttl (seconds):
        - 0: infinite expiration
        - undefined: default ttl
    */
    return ttl ? ttl : ttl === 0 ? this.infiniteExpiration : this.defaultTTL
  }

  private serialize(data: any) {
    if (data === undefined || data === null) {
      return 'null'
    }
    return JSON.stringify(data)
  }

  private deserialize(data: any) {
    if (data === null) {
      return undefined
    }
    return JSON.parse(data)
  }

  private toGlobPattern(pattern: string): string {
    return pattern.replaceAll('\\', '\\\\').replaceAll('?', '\\?').replaceAll('[', '\\[').replaceAll(']', '\\]')
  }
}
