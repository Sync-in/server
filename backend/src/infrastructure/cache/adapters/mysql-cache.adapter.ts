import { Inject, Injectable, Logger } from '@nestjs/common'
import { SchedulerRegistry } from '@nestjs/schedule'
import { CronJob } from 'cron'
import { and, between, eq, exists, inArray, notBetween, SQL, sql } from 'drizzle-orm'
import cluster from 'node:cluster'
import { createCacheKeySlug, currentTimeStamp } from '../../../common/shared'
import { configuration } from '../../../configuration/config.environment'
import { DB_TOKEN_PROVIDER } from '../../database/constants'
import { DBSchema } from '../../database/interfaces/database.interface'
import { dbCheckAffectedRows, dbParseJson } from '../../database/utils'
import { SCHEDULER_ENV, SCHEDULER_STATE } from '../../scheduler/scheduler.constants'
import type { CacheRateLimitResult, CacheRateLimitState } from '../interfaces/cache-rate-limit.interface'
import { MysqlCache } from '../schemas/mysql-cache.interface'
import { cache } from '../schemas/mysql-cache.schema'
import { Cache } from '../cache.service'

@Injectable()
export class MysqlCacheAdapter implements Cache {
  /* Useful SQL commands to stats the scheduler
    SHOW VARIABLES LIKE 'event_scheduler';
    SHOW EVENTS;
  */
  defaultTTL: number = configuration.cache.ttl
  infiniteExpiration = -1
  private scheduledJob: CronJob
  private readonly scheduledJobName = 'cache_expired_keys' as const
  private readonly scheduledJobInterval = 5 // minutes
  private readonly logger = new Logger(Cache.name.toUpperCase())

  constructor(
    @Inject(DB_TOKEN_PROVIDER) private readonly db: DBSchema,
    private readonly scheduler: SchedulerRegistry
  ) {}

  async onModuleInit(): Promise<void> {
    if (cluster.isWorker && process.env[SCHEDULER_ENV] === SCHEDULER_STATE.ENABLED) {
      try {
        await this.db.execute(`SET GLOBAL event_scheduler = ON;`)
        await this.db.execute(`DROP EVENT IF EXISTS ${this.scheduledJobName};`)
        await this.db.execute(`CREATE EVENT IF NOT EXISTS ${this.scheduledJobName}
                               ON SCHEDULE EVERY ${this.scheduledJobInterval} MINUTE
                               DO DELETE FROM cache WHERE cache.expiration BETWEEN 0 AND UNIX_TIMESTAMP();`)
        this.logger.log(`Using MySQL scheduler`)
      } catch (e) {
        this.logger.error(`MySQL scheduler on '${e?.sql || e?.code}' : ${e.message || e}`)
        this.logger.warn(`Fallback to internal scheduler`)
        this.scheduledJob = new CronJob(`0 */${this.scheduledJobInterval} * * * *`, async () => await this.clearExpiredKeys())
        this.scheduler.addCronJob(this.scheduledJobName, this.scheduledJob)
        this.scheduledJob.start()
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.scheduledJob) {
      await this.scheduledJob.stop()
    }
  }

  async keys(pattern: string): Promise<string[]> {
    const ks = await this.db
      .select({ key: cache.key })
      .from(cache)
      .where(and(sql`${cache.key} LIKE ${this.toLikePattern(pattern)} ESCAPE '='`, this.whereNotExpired()))
    return ks.map((k: { key: string }) => k.key)
  }

  async has(key: string): Promise<boolean> {
    const [r] = await this.db
      .select({ key: cache.key })
      .from(cache)
      .where(
        exists(
          this.db
            .select({ key: cache.key })
            .from(cache)
            .where(and(eq(cache.key, key), this.whereNotExpired()))
        )
      )
    return !!r
  }

  async get(key: string): Promise<any> {
    const [v]: { value: any }[] = await this.db
      .select({ value: cache.value })
      .from(cache)
      .where(and(eq(cache.key, key), this.whereNotExpired()))
      .limit(1)
    return v ? v.value : v
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
        .values({ key, value: initialValue, expiration: exp } satisfies MysqlCache)
        .onDuplicateKeyUpdate({
          set: {
            value: sql`LAST_INSERT_ID(${value})`,
            expiration: exp
          } as Partial<MysqlCache>
        })
      return result.affectedRows === 1 && Number(result.insertId) === 0 ? initialValue : Number(result.insertId)
    } catch (e) {
      this.logger.error({ tag: this.increment.name, msg: `${e}` })
      throw e
    }
  }

  async consumeRateLimit(key: string, ttl: number, limit: number, blockDuration: number): Promise<CacheRateLimitResult> {
    return this.db.transaction(async (tx) => {
      // The no-op upsert creates or locks the row, serializing concurrent workers from the first request.
      await tx
        .insert(cache)
        .values({ key, value: null, expiration: this.infiniteExpiration } satisfies MysqlCache)
        .onDuplicateKeyUpdate({ set: { key: sql`${cache.key}` } })

      const [entry] = await tx
        .select({ value: cache.value, now: sql<number>`UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000`.mapWith(Number) })
        .from(cache)
        .where(eq(cache.key, key))
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
      await tx.update(cache).set({ value: state, expiration }).where(eq(cache.key, key))

      return {
        totalHits: state.hits.length,
        timeToExpire: Math.max(0, Math.ceil(((state.hits[0] ?? now) - now) / 1000)),
        isBlocked: state.blockExpiresAt > now,
        timeToBlockExpire: Math.max(0, Math.ceil((state.blockExpiresAt - now) / 1000))
      }
    })
  }

  async set(key: string, data: unknown, ttl?: number): Promise<boolean> {
    data = this.serialize(data)
    const exp = this.getTTL(ttl)
    try {
      await this.db
        .insert(cache)
        .values({ key: key, value: data, expiration: exp } as MysqlCache)
        .onDuplicateKeyUpdate({
          set: {
            value: data,
            expiration: exp
          } as Partial<MysqlCache>
        })
      return true
    } catch (e) {
      this.logger.error({ tag: this.set.name, msg: `${e}` })
      return false
    }
  }

  async del(key: string): Promise<boolean> {
    return dbCheckAffectedRows(await this.db.delete(cache).where(eq(cache.key, key)), 1, false)
  }

  async mdel(keys: string[]): Promise<boolean> {
    if (!keys.length) return false
    const [result] = await this.db.delete(cache).where(inArray(cache.key, keys))
    return result.affectedRows > 0
  }

  genSlugKey(...args: any[]): string {
    return createCacheKeySlug(args)
  }

  private readonly whereNotExpired: () => SQL = () => notBetween(cache.expiration, 0, currentTimeStamp())

  private readonly whereExpired: () => SQL = () => between(cache.expiration, 0, currentTimeStamp())

  private getTTL(ttl: number): number {
    /* ttl (seconds):
        - 0 : infinite expiration
        - undefined : default ttl
    */
    return ttl ? currentTimeStamp() + ttl : ttl === 0 ? this.infiniteExpiration : currentTimeStamp() + this.defaultTTL
  }

  private serialize(data: any) {
    if (data === undefined) {
      // undefined values are not handled by JSON serialization
      return null
    }
    return data
  }

  private toLikePattern(pattern: string): string {
    return pattern.replaceAll('=', '==').replaceAll('%', '=%').replaceAll('_', '=_').replaceAll('*', '%')
  }

  private async clearExpiredKeys() {
    try {
      await this.db.delete(cache).where(this.whereExpired())
    } catch (e) {
      this.logger.error({ tag: this.clearExpiredKeys.name, msg: `${e?.code || e}` })
    }
  }
}
