import { Injectable, Logger } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { RedisClientOptions, RedisClientType } from 'redis'
import { toErrorMessage } from '../../../common/errors.js'
import { createCacheKeySlug } from '../../../common/shared.js'
import { configuration } from '../../../configuration/config.environment.js'
import { INFRASTRUCTURE_CONNECTION_RETRY_DELAY, INFRASTRUCTURE_DEPENDENCY } from '../../availability/availability.constants.js'
import { Availability } from '../../availability/availability.service.js'
import { connectionErrorMessage, isRetryableConnectionError, redactRedisUrl } from '../../utils.js'
import { Cache, validateCacheRevisionCommand } from '../cache.service.js'
import type { CacheRateLimitResult } from '../interfaces/cache-rate-limit.interface.js'
import {
  CACHE_REVISION_MAX_SNAPSHOT_ENTRIES,
  type CacheRevisionCommit,
  type CacheRevisionMutationCommit,
  type CacheRevisionSnapshot,
  type CacheRevisionSnapshotCommand
} from '../interfaces/cache-revision.interface.js'

const REVISION_INDEX_EXPIRATION_SCRIPT = `
    -- A score-zero member keeps the index persistent; otherwise expire it with the last finite entry.
    if redis.call('ZCOUNT', KEYS[2], 0, 0) > 0 then
      redis.call('PERSIST', KEYS[2])
    else
      local lastEntry = redis.call('ZREVRANGE', KEYS[2], 0, 0, 'WITHSCORES')
      if #lastEntry > 0 then
        redis.call('PEXPIREAT', KEYS[2], lastEntry[2])
      end
    end
`

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

  async commitRevision(command: CacheRevisionCommit): Promise<boolean> {
    return this.executeRevisionCommit(command, command.expectedRevision)
  }

  async readRevisionSnapshot(command: CacheRevisionSnapshotCommand): Promise<CacheRevisionSnapshot> {
    const result = await this.client.eval(this.revisionSnapshotScript, {
      keys: [command.revisionKey, this.revisionIndexKey(command.revisionKey)],
      arguments: [String(CACHE_REVISION_MAX_SNAPSHOT_ENTRIES)]
    })
    if (
      !Array.isArray(result) ||
      !result.every((entry): entry is string => typeof entry === 'string') ||
      result.length === 0 ||
      (result.length - 1) % 2 !== 0
    ) {
      throw new Error(`Unexpected cache revision snapshot for ${command.revisionKey}`)
    }

    const revision = result[0] === '' ? null : this.deserialize(result[0])
    if (revision !== null && typeof revision !== 'string') {
      throw new Error(`Invalid cache revision for ${command.revisionKey}`)
    }

    const entries: CacheRevisionSnapshot['entries'] = []
    for (let index = 1; index < result.length; index += 2) {
      if (this.matchesPattern(result[index], command.pattern)) {
        entries.push({ key: result[index], value: this.deserialize(result[index + 1]) })
      }
    }
    return { revision, entries }
  }

  async mutateRevision(command: CacheRevisionMutationCommit): Promise<boolean> {
    return this.executeRevisionCommit(command)
  }

  private async executeRevisionCommit(command: CacheRevisionMutationCommit, expectedRevision?: string | null): Promise<boolean> {
    validateCacheRevisionCommand(command, this.defaultTTL, this.revisionIndexKey(command.revisionKey))
    const revisionExpectation = expectedRevision === undefined ? 'any' : expectedRevision === null ? 'absent' : 'match'
    const serializedExpectedRevision = typeof expectedRevision === 'string' ? this.serialize(expectedRevision) : ''
    const serializedMutations = command.mutations.map((mutation) => {
      const serializedMutation = {
        type: mutation.type,
        key: mutation.key,
        expect: mutation.expect,
        expectedLockId: mutation.expectedLockId
      }
      if (mutation.type === 'delete') return serializedMutation

      const value = this.serialize(mutation.value)
      if (typeof value !== 'string') {
        throw new TypeError(`Cache revision mutation value is not JSON serializable for key: ${mutation.key}`)
      }
      return { ...serializedMutation, value, expiration: this.getTTL(mutation.ttl) }
    })

    const result = await this.client.eval(this.revisionCommitScript, {
      keys: [command.revisionKey, this.revisionIndexKey(command.revisionKey)],
      arguments: [
        revisionExpectation,
        serializedExpectedRevision,
        this.serialize(randomUUID()),
        JSON.stringify(serializedMutations),
        String(CACHE_REVISION_MAX_SNAPSHOT_ENTRIES)
      ]
    })
    if (result !== 0 && result !== 1) throw new Error(`Unexpected cache revision result: ${String(result)}`)
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

  private readonly revisionCommitScript = `
    local indexType = redis.call('TYPE', KEYS[2]).ok
    if indexType ~= 'none' and indexType ~= 'zset' then
      return redis.error_reply('Invalid cache revision index type')
    end

    local currentRevision = redis.call('GET', KEYS[1])
    if ARGV[1] == 'absent' then
      if currentRevision ~= false then
        return 0
      end
    elseif ARGV[1] == 'match' then
      if currentRevision ~= ARGV[2] then
        return 0
      end
    elseif ARGV[1] ~= 'any' then
      return redis.error_reply('Invalid cache revision expectation')
    end

    local mutations = cjson.decode(ARGV[4])

    -- Validate the complete snapshot before the first write.
    for _, mutation in ipairs(mutations) do
      local currentValue = redis.call('GET', mutation.key)
      local isPresent = currentValue ~= false
      if (mutation.expect == 'present') ~= isPresent then
        return 0
      end
      if mutation.expectedLockId ~= nil then
        local value = cjson.decode(currentValue)
        if type(value) ~= 'table' or value.lockId ~= mutation.expectedLockId then
          return 0
        end
      end
    end

    local time = redis.call('TIME')
    local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
    redis.call('ZREMRANGEBYSCORE', KEYS[2], 1, now)

    -- Redis scripts do not roll back prior writes after a runtime error, so enforce capacity before changing lock keys.
    local indexedCount = redis.call('ZCARD', KEYS[2])
    for _, mutation in ipairs(mutations) do
      local isIndexed = redis.call('ZSCORE', KEYS[2], mutation.key) ~= false
      if mutation.type == 'set' and not isIndexed then
        indexedCount = indexedCount + 1
      elseif mutation.type == 'delete' and isIndexed then
        indexedCount = indexedCount - 1
      end
    end
    if indexedCount > tonumber(ARGV[5]) then
      return redis.error_reply('Cache revision snapshot exceeds maximum entries')
    end

    for _, mutation in ipairs(mutations) do
      if mutation.type == 'set' then
        if mutation.expiration == -1 then
          redis.call('SET', mutation.key, mutation.value)
          redis.call('ZADD', KEYS[2], 0, mutation.key)
        else
          local expiresAt = now + mutation.expiration * 1000
          redis.call('SET', mutation.key, mutation.value, 'PXAT', expiresAt)
          redis.call('ZADD', KEYS[2], expiresAt, mutation.key)
        end
      else
        redis.call('UNLINK', mutation.key)
        redis.call('ZREM', KEYS[2], mutation.key)
      end
    end

${REVISION_INDEX_EXPIRATION_SCRIPT}

    -- SET without an expiration keeps the revision sidecar persistent.
    redis.call('SET', KEYS[1], ARGV[3])
    return 1
  `

  private readonly revisionSnapshotScript = `
    local indexType = redis.call('TYPE', KEYS[2]).ok
    if indexType ~= 'none' and indexType ~= 'zset' then
      return redis.error_reply('Invalid cache revision index type')
    end

    local time = redis.call('TIME')
    local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
    redis.call('ZREMRANGEBYSCORE', KEYS[2], 1, now)

    if redis.call('ZCARD', KEYS[2]) > tonumber(ARGV[1]) then
      return redis.error_reply('Cache revision snapshot exceeds maximum entries')
    end

    local result = { redis.call('GET', KEYS[1]) or '' }
    local indexedKeys = redis.call('ZRANGE', KEYS[2], 0, -1)
    local indexedValues = {}
    if #indexedKeys > 0 then
      -- One bounded MGET avoids dispatching one Redis command per indexed lock.
      indexedValues = redis.call('MGET', unpack(indexedKeys))
    end
    for index, indexedKey in ipairs(indexedKeys) do
      local value = indexedValues[index]
      if value then
        table.insert(result, indexedKey)
        table.insert(result, value)
      else
        redis.call('ZREM', KEYS[2], indexedKey)
      end
    end

${REVISION_INDEX_EXPIRATION_SCRIPT}
    return result
  `

  private revisionIndexKey(revisionKey: string): string {
    return `${revisionKey}|index`
  }

  private matchesPattern(value: string, pattern: string): boolean {
    const parts = pattern.split('*')
    if (parts.length === 1) return value === pattern

    let position = 0
    if (parts[0]) {
      if (!value.startsWith(parts[0])) return false
      position = parts[0].length
    }
    for (let index = 1; index < parts.length - 1; index++) {
      if (!parts[index]) continue
      const matchIndex = value.indexOf(parts[index], position)
      if (matchIndex === -1) return false
      position = matchIndex + parts[index].length
    }
    const suffix = parts[parts.length - 1]
    return !suffix || (value.endsWith(suffix) && value.length - suffix.length >= position)
  }

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
