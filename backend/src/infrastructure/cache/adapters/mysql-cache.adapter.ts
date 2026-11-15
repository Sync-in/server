import { Inject, Injectable, Logger } from '@nestjs/common'
import { and, between, inArray, notBetween, type SQL, sql } from 'drizzle-orm'
import type { MySqlQueryResult } from 'drizzle-orm/mysql2'
import { toErrorMessage } from '../../../common/errors.js'
import { createCacheKeySlug, currentTimeStamp } from '../../../common/shared.js'
import { configuration } from '../../../configuration/config.environment.js'
import { INFRASTRUCTURE_DEPENDENCY } from '../../availability/availability.constants.js'
import { Availability } from '../../availability/availability.service.js'
import { DB_TOKEN_PROVIDER } from '../../database/constants.js'
import { type DBSchema } from '../../database/interfaces/database.interface.js'
import { dbCheckAffectedRows, dbParseJson, getMysqlError } from '../../database/utils.js'
import { SchedulerManager } from '../../scheduler/scheduler-manager.service.js'
import type { CacheRateLimitResult, CacheRateLimitState } from '../interfaces/cache-rate-limit.interface.js'
import type { CacheCompareAndSwapCommand } from '../interfaces/cache-compare-and-swap.interface.js'
import { cache } from '../schemas/mysql-cache.schema.js'
import { Cache, validateCacheCompareAndSwapCommand } from '../cache.service.js'

function getErrorSource(error: unknown): string | undefined {
  if (error === null || typeof error !== 'object') return undefined
  if ('sql' in error && typeof error.sql === 'string') return error.sql
  return 'code' in error && typeof error.code === 'string' ? error.code : undefined
}

@Injectable()
export class MysqlCacheAdapter implements Cache {
  /* Useful SQL commands to stats the scheduler
    SHOW VARIABLES LIKE 'event_scheduler';
    SHOW EVENTS;
  */
  defaultTTL: number = configuration.cache.ttl
  infiniteExpiration = -1
  private readonly scheduledJobName = 'cache_expired_keys' as const
  private readonly scheduledJobInterval = 5 // minutes
  private readonly retryableCompareAndSwapErrorCode = 'ER_LOCK_DEADLOCK'
  private readonly compareAndSwapDeadlockRetries = 1
  private readonly logger = new Logger(Cache.name.toUpperCase())
  private internalSchedulerRegistered = false
  private unsubscribeAvailability?: () => void

  constructor(
    @Inject(DB_TOKEN_PROVIDER) private readonly db: DBSchema,
    private readonly schedulerManager: SchedulerManager,
    private readonly availability: Availability
  ) {
    availability.register(INFRASTRUCTURE_DEPENDENCY.CACHE, true)
  }

  async onModuleInit(): Promise<void> {
    if (!this.schedulerManager.isSchedulerProcess) return

    this.unsubscribeAvailability = this.availability.onChange((dependency, isAvailable) => {
      // SchedulerManager pauses the internal cron during an outage; recovery is the right time to retry the MySQL event.
      if (dependency === INFRASTRUCTURE_DEPENDENCY.DATABASE && isAvailable) {
        void this.useMysqlScheduler()
      }
    })

    // A fallback cannot run without the database, so wait for its recovery instead of registering one prematurely.
    if (this.availability.isAvailable(INFRASTRUCTURE_DEPENDENCY.DATABASE)) {
      await this.useMysqlScheduler()
    }
  }

  onModuleDestroy(): void {
    this.unsubscribeAvailability?.()
    this.schedulerManager.unregisterCron(this.scheduledJobName)
  }

  async keys(pattern: string): Promise<string[]> {
    const ks = await this.db
      .select({ key: cache.key })
      .from(cache)
      .where(and(sql`${cache.key} LIKE ${this.toLikePattern(pattern)} ESCAPE '='`, this.whereNotExpired()))
    return ks.map((k: { key: string }) => k.key)
  }

  async has(key: string): Promise<boolean> {
    const [entry] = await this.db
      .select({ key: cache.key })
      .from(cache)
      .where(and(this.whereKey(key), this.whereNotExpired()))
      .limit(1)
    return entry !== undefined
  }

  async get(key: string): Promise<any> {
    const [v]: { value: any }[] = await this.db
      .select({ value: cache.value })
      .from(cache)
      .where(and(this.whereKey(key), this.whereNotExpired()))
      .limit(1)
    return v?.value
  }

  async mget(keys: string[]): Promise<any[]> {
    if (!keys.length) return []
    const entries: { key: string; value: any }[] = await this.db
      .select({ key: cache.key, value: cache.value })
      .from(cache)
      .where(and(inArray(cache.key, keys), this.whereNotExpired()))
    const valuesByKey = new Map(entries.map((entry) => [entry.key, entry.value]))
    return keys.map((key) => valuesByKey.get(key))
  }

  async increment(key: string, amount = 1, ttl?: number, minimum?: number): Promise<number> {
    const now = currentTimeStamp()
    const exp = this.getTTL(ttl)
    const initialValue = minimum === undefined ? amount : Math.max(amount, minimum)
    const incrementedValue = sql`IF(${cache.expiration} BETWEEN 0 AND ${now}, ${initialValue}, COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(${cache.value}, '$')) AS SIGNED), 0) + ${amount})`
    const value = minimum === undefined ? incrementedValue : sql`GREATEST(${incrementedValue}, ${minimum})`
    try {
      /*
       * INSERT ... ON DUPLICATE KEY UPDATE atomically creates or updates the counter while locking its row.
       * Expired values restart from initialValue, and GREATEST optionally prevents the result from falling below minimum.
       * On update, LAST_INSERT_ID(value) both stores the computed value and exposes it through the connection-scoped
       * insertId returned by the driver, avoiding an additional SELECT. A new row returns initialValue directly.
       */
      const [result]: any = await this.db
        .insert(cache)
        .values({ key, value: initialValue, expiration: exp })
        .onDuplicateKeyUpdate({
          set: {
            value: sql`LAST_INSERT_ID(${value})`,
            expiration: exp
          }
        })
      return result.affectedRows === 1 && Number(result.insertId) === 0 ? initialValue : Number(result.insertId)
    } catch (e) {
      this.logger.error({ tag: this.increment.name, msg: toErrorMessage(e) })
      throw e
    }
  }

  async consumeRateLimit(key: string, ttl: number, limit: number, blockDuration: number): Promise<CacheRateLimitResult> {
    return this.db.transaction(async (tx) => {
      // The no-op upsert creates or locks the row, serializing concurrent workers from the first request.
      await tx
        .insert(cache)
        .values({ key, value: null, expiration: this.infiniteExpiration })
        .onDuplicateKeyUpdate({ set: { key: sql`${cache.key}` } })

      const [entry] = await tx
        .select({ value: cache.value, now: sql<number>`UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000`.mapWith(Number) })
        .from(cache)
        .where(this.whereKey(key))
        .limit(1)
        .for('update')
      const now = entry.now
      const state: CacheRateLimitState = dbParseJson(entry.value) ?? { hits: [], blockExpiresAt: 0 }

      // A completed block starts a fresh window, as in the in-memory throttler storage.
      if (state.blockExpiresAt > 0 && state.blockExpiresAt <= now) {
        state.hits = []
        state.blockExpiresAt = 0
      }
      state.hits = state.hits.filter((expiresAt) => expiresAt > now)
      // Requests received during a block do not extend it.
      if (state.blockExpiresAt === 0) {
        state.hits.push(now + ttl)
        if (state.hits.length > limit) {
          state.blockExpiresAt = now + blockDuration
        }
      }

      // The cache table stores its physical expiration in seconds; throttler durations use milliseconds.
      const expiration = Math.ceil(Math.max(state.blockExpiresAt, ...state.hits) / 1000)
      await tx.update(cache).set({ value: state, expiration }).where(this.whereKey(key))

      return {
        totalHits: state.hits.length,
        timeToExpire: Math.max(0, Math.ceil(((state.hits[0] ?? now) - now) / 1000)),
        isBlocked: state.blockExpiresAt > now,
        timeToBlockExpire: Math.max(0, Math.ceil((state.blockExpiresAt - now) / 1000))
      }
    })
  }

  async compareAndSwap(command: CacheCompareAndSwapCommand): Promise<boolean> {
    validateCacheCompareAndSwapCommand(command, this.defaultTTL)
    const value = command.value === undefined ? undefined : this.serialize(command.value)
    const expiration = command.value === undefined ? undefined : this.getDatabaseTTL(command.ttl)
    for (let attempt = 0; ; attempt++) {
      try {
        if (command.expectedVersion === null && value !== undefined) {
          // Expired rows still occupy the unique key. Reclaim one after an insert
          // collision, then retry the insert to distinguish deletion from a concurrent writer.
          try {
            await this.db.insert(cache).values({ key: command.key, value, expiration: expiration! })
            return true
          } catch (error) {
            if (getMysqlError(error)?.code !== 'ER_DUP_ENTRY') throw error
          }

          const updateResult = await this.db
            .update(cache)
            .set({ value, expiration: expiration! })
            .where(and(this.whereKey(command.key), this.whereExpired()))
          if (dbCheckAffectedRows(updateResult, 1, false)) return true

          try {
            await this.db.insert(cache).values({ key: command.key, value, expiration: expiration! })
            return true
          } catch (error) {
            if (getMysqlError(error)?.code === 'ER_DUP_ENTRY') return false
            throw error
          }
        }

        if (command.expectedVersion !== null) {
          const whereVersionMatches = and(this.whereKey(command.key), this.whereNotExpired(), this.whereVersion(command.expectedVersion))
          if (value === undefined) {
            return dbCheckAffectedRows(await this.db.delete(cache).where(whereVersionMatches), 1, false)
          }
          return dbCheckAffectedRows(await this.db.update(cache).set({ value, expiration: expiration! }).where(whereVersionMatches), 1, false)
        }

        return await this.db.transaction(async (tx) => {
          const [entry] = await tx
            .select({ expiration: cache.expiration, now: this.databaseTime().mapWith(Number) })
            .from(cache)
            .where(this.whereKey(command.key))
            .limit(1)
            .for('update')
          const isPresent = entry !== undefined && (entry.expiration === this.infiniteExpiration || entry.expiration > entry.now)

          if (isPresent) return false
          if (entry !== undefined) await tx.delete(cache).where(this.whereKey(command.key))
          return true
        })
      } catch (error) {
        if (getMysqlError(error)?.code === this.retryableCompareAndSwapErrorCode && attempt < this.compareAndSwapDeadlockRetries) {
          this.logger.warn({ tag: this.compareAndSwap.name, msg: `Retrying ${command.key} after a database deadlock` })
          continue
        }
        throw error
      }
    }
  }

  async set(key: string, data: unknown, ttl?: number): Promise<boolean> {
    data = this.serialize(data)
    const exp = this.getTTL(ttl)
    try {
      await this.db
        .insert(cache)
        .values({ key, value: data, expiration: exp })
        .onDuplicateKeyUpdate({
          set: {
            value: data,
            expiration: exp
          }
        })
      return true
    } catch (e) {
      this.logger.error({ tag: this.set.name, msg: toErrorMessage(e) })
      return false
    }
  }

  async del(key: string): Promise<boolean> {
    return dbCheckAffectedRows(await this.db.delete(cache).where(this.whereKey(key)), 1, false)
  }

  async mdel(keys: string[]): Promise<boolean> {
    if (!keys.length) return false
    const [result] = await this.db.delete(cache).where(inArray(cache.key, keys))
    return result.affectedRows > 0
  }

  genSlugKey(...args: any[]): string {
    return createCacheKeySlug(args)
  }

  private readonly databaseTime: () => SQL<number> = () => sql<number>`UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))`

  // Use the generated hash index, then compare the full key to reject hash collisions.
  private readonly whereKey = (key: string): SQL => sql`${cache.keyHash} = UNHEX(SHA2(${key}, 256)) AND ${cache.key} = ${key}`

  private readonly whereNotExpired: () => SQL = () => notBetween(cache.expiration, 0, this.databaseTime())

  private readonly whereExpired: () => SQL = () => between(cache.expiration, 0, this.databaseTime())

  private readonly whereVersion = (expectedVersion: string): SQL => sql`JSON_TYPE(${cache.value}) = 'OBJECT'
    AND JSON_TYPE(JSON_EXTRACT(${cache.value}, '$.version')) = 'STRING'
    AND BINARY JSON_UNQUOTE(JSON_EXTRACT(${cache.value}, '$.version')) = BINARY ${expectedVersion}`

  private getTTL(ttl?: number): number {
    /* ttl (seconds):
        - 0 : infinite expiration
        - undefined : default ttl
    */
    return ttl ? currentTimeStamp() + ttl : ttl === 0 ? this.infiniteExpiration : currentTimeStamp() + this.defaultTTL
  }

  private getDatabaseTTL(ttl?: number): number | SQL {
    if (ttl === 0) return this.infiniteExpiration
    return sql`CEIL(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) + ${ttl ?? this.defaultTTL})`
  }

  private serialize(data: any) {
    return data ?? null
  }

  private toLikePattern(pattern: string): string {
    return pattern.replaceAll('=', '==').replaceAll('%', '=%').replaceAll('_', '=_').replaceAll('*', '%')
  }

  private async useMysqlScheduler(): Promise<void> {
    try {
      // SET GLOBAL requires SUPER, skip it when the scheduler is already enabled (only the EVENT privilege is needed then)
      const [rows]: { value: string }[][] = (await this.db.execute(`SELECT @@GLOBAL.event_scheduler AS value;`)) as MySqlQueryResult
      if (rows[0]?.value !== 'ON') {
        await this.db.execute(`SET GLOBAL event_scheduler = ON;`)
      }
      await this.db.execute(`DROP EVENT IF EXISTS ${this.scheduledJobName};`)
      await this.db.execute(`CREATE EVENT IF NOT EXISTS ${this.scheduledJobName}
                             ON SCHEDULE EVERY ${this.scheduledJobInterval} MINUTE
                             DO DELETE FROM cache WHERE cache.expiration BETWEEN 0 AND UNIX_TIMESTAMP();`)
      // Keep the fallback until the MySQL event is fully configured, then remove the local cron.
      if (this.internalSchedulerRegistered) {
        this.schedulerManager.unregisterCron(this.scheduledJobName)
        this.internalSchedulerRegistered = false
      }
      this.logger.log(`Using MySQL scheduler`)
    } catch (e) {
      const errorSource = getErrorSource(e)
      this.logger.warn(
        `MariaDB event scheduler configuration failed${errorSource ? ` on '${errorSource}'` : ''}: ${toErrorMessage(e)}. ` +
          `Enable the scheduler with "event_scheduler = ON" in the [mysqld] section of the MariaDB configuration (or "SET GLOBAL event_scheduler = ON" as a user with SUPER) ` +
          `and grant the EVENT privilege on the Sync-in database to its MariaDB user`
      )
      this.useInternalScheduler()
    }
  }

  private useInternalScheduler(): void {
    // Preserve a single registration: SchedulerManager owns its pause and resume across database outages.
    if (this.internalSchedulerRegistered) return
    this.logger.warn(`Fallback to internal scheduler`)
    this.schedulerManager.registerCron(this.scheduledJobName, `0 */${this.scheduledJobInterval} * * * *`, () => this.clearExpiredKeys())
    this.internalSchedulerRegistered = true
  }

  private async clearExpiredKeys() {
    try {
      await this.db.delete(cache).where(this.whereExpired())
    } catch (e) {
      this.logger.error({ tag: this.clearExpiredKeys.name, msg: getErrorSource(e) ?? toErrorMessage(e) })
    }
  }
}
