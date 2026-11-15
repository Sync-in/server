import { Injectable, Logger } from '@nestjs/common'
import type { RedisClientOptions, RedisClientType } from 'redis'
import { toErrorMessage } from '../../../common/errors.js'
import { createCacheKeySlug } from '../../../common/shared.js'
import { configuration } from '../../../configuration/config.environment.js'
import { INFRASTRUCTURE_CONNECTION_RETRY_DELAY, INFRASTRUCTURE_DEPENDENCY } from '../../availability/availability.constants.js'
import { Availability } from '../../availability/availability.service.js'
import { connectionErrorMessage, isRetryableConnectionError, redactRedisUrl } from '../../utils.js'
import { Cache, validateCacheCompareAndSwapCommand } from '../cache.service.js'
import type { CacheCompareAndSwapCommand } from '../interfaces/cache-compare-and-swap.interface.js'
import type { CacheRateLimitResult } from '../interfaces/cache-rate-limit.interface.js'

@Injectable()
export class RedisCacheAdapter implements Cache {
  defaultTTL: number = configuration.cache.ttl
  infiniteExpiration = -1
  private readonly logger = new Logger(Cache.name.toUpperCase())
  private client!: RedisClientType
  private readonly redactedRedisUrl = redactRedisUrl(configuration.cache.redis)

  constructor(private readonly availability: Availability) {
    this.availability.register(INFRASTRUCTURE_DEPENDENCY.CACHE)
  }

  async onModuleInit(): Promise<void> {
    const { createClient } = await import('redis')
    this.client = createClient({
      url: configuration.cache.redis,
      socket: { noDelay: true, reconnectStrategy: this.reconnectStrategy }
    } satisfies RedisClientOptions)
    this.client.on('error', (e: Error) => {
      this.availability.setAvailable(INFRASTRUCTURE_DEPENDENCY.CACHE, this.client.isReady)
      this.logger.error(toErrorMessage(e))
    })
    this.client.on('reconnecting', () => this.availability.setAvailable(INFRASTRUCTURE_DEPENDENCY.CACHE, false))
    this.client.on('ready', () => {
      this.availability.setAvailable(INFRASTRUCTURE_DEPENDENCY.CACHE, true)
      this.logger.log(`Connected to Redis Server at ${this.redactedRedisUrl}`)
    })
    await this.client.connect()
  }

  async onModuleDestroy() {
    this.availability.setAvailable(INFRASTRUCTURE_DEPENDENCY.CACHE, false)
    if (this.client?.isOpen) {
      await this.client.close()
    }
  }

  async has(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1
  }

  async keys(pattern: string): Promise<string[]> {
    const matches = new Set<string>()
    for await (const keys of this.client.scanIterator({ MATCH: this.toGlobPattern(pattern), COUNT: 100 })) {
      for (const key of keys) matches.add(key)
    }
    return [...matches]
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

  async compareAndSwap(command: CacheCompareAndSwapCommand): Promise<boolean> {
    validateCacheCompareAndSwapCommand(command, this.defaultTTL)
    const value = command.value === undefined ? '' : this.serialize(command.value)
    if (typeof value !== 'string') {
      throw new TypeError(`Cache compare-and-swap value is not JSON serializable for key: ${command.key}`)
    }
    const result = await this.client.eval(this.compareAndSwapScript, {
      keys: [command.key],
      arguments: [
        command.expectedVersion === null ? 'absent' : 'match',
        command.expectedVersion ?? '',
        command.value === undefined ? 'delete' : 'set',
        value,
        command.value === undefined ? '' : String(this.getTTL(command.ttl))
      ]
    })
    if (result !== 0 && result !== 1) throw new Error(`Unexpected cache compare-and-swap result: ${String(result)}`)
    return result === 1
  }

  async set(key: string, data: unknown, ttl?: number): Promise<boolean> {
    const exp = this.getTTL(ttl)
    const options = exp === this.infiniteExpiration ? {} : { expiration: { type: 'EX' as const, value: exp } }
    try {
      return (await this.client.set(key, this.serialize(data), options)) === 'OK'
    } catch (e) {
      this.logger.error({ tag: this.set.name, msg: toErrorMessage(e) })
      return false
    }
  }

  async del(key: string): Promise<boolean> {
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

  private readonly reconnectStrategy = (_attempts: number, cause: Error): number | Error => {
    this.availability.setAvailable(INFRASTRUCTURE_DEPENDENCY.CACHE, false)
    if (!isRetryableConnectionError(cause)) {
      return new Error(`Unable to connect to Redis server: ${connectionErrorMessage(cause)}`)
    }
    this.logger.warn(`Retrying connection to Redis server in ${INFRASTRUCTURE_CONNECTION_RETRY_DELAY / 1000}s`)
    return INFRASTRUCTURE_CONNECTION_RETRY_DELAY
  }

  private readonly compareAndSwapScript = `
    local currentValue = redis.call('GET', KEYS[1])
    if ARGV[1] == 'absent' then
      if currentValue ~= false then
        return 0
      end
    elseif ARGV[1] == 'match' then
      if currentValue == false then
        return 0
      end
      local decoded, current = pcall(cjson.decode, currentValue)
      if not decoded then
        return redis.error_reply('Invalid versioned cache value')
      end
      if type(current) ~= 'table' or current.version ~= ARGV[2] then
        return 0
      end
    else
      return redis.error_reply('Invalid cache compare-and-swap expectation')
    end

    if ARGV[3] == 'delete' then
      redis.call('UNLINK', KEYS[1])
    elseif ARGV[3] == 'set' then
      if ARGV[5] == '-1' then
        redis.call('SET', KEYS[1], ARGV[4])
      else
        redis.call('SET', KEYS[1], ARGV[4], 'EX', ARGV[5])
      end
    else
      return redis.error_reply('Invalid cache compare-and-swap operation')
    end
    return 1
  `

  private getTTL(ttl?: number): number {
    /* ttl (seconds):
        - 0: infinite expiration
        - undefined: default ttl
    */
    return ttl ? ttl : ttl === 0 ? this.infiniteExpiration : this.defaultTTL
  }

  private serialize(data: any) {
    return data === undefined || data === null ? 'null' : JSON.stringify(data)
  }

  private deserialize(data: any) {
    return data === null ? undefined : JSON.parse(data)
  }

  private toGlobPattern(pattern: string): string {
    return pattern.replaceAll('\\', '\\\\').replaceAll('?', '\\?').replaceAll('[', '\\[').replaceAll(']', '\\]')
  }
}
