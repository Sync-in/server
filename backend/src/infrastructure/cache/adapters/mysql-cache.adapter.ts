import { Inject, Injectable, Logger } from '@nestjs/common'
import { and, between, eq, inArray, ne, notBetween, SQL, sql } from 'drizzle-orm'
import { unionAll } from 'drizzle-orm/mysql-core'
import type { MySqlQueryResult } from 'drizzle-orm/mysql2'
import { randomUUID } from 'node:crypto'
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
import {
  type CacheRevisionCommit,
  type CacheRevisionMutation,
  type CacheRevisionMutationCommit,
  type CacheRevisionSnapshot,
  type CacheRevisionSnapshotCommand
} from '../interfaces/cache-revision.interface.js'
import { cache } from '../schemas/mysql-cache.schema.js'
import { Cache, validateCacheRevisionCommand } from '../cache.service.js'

function getErrorSource(error: unknown): string | undefined {
  if (error === null || typeof error !== 'object') return undefined
  if ('sql' in error && typeof error.sql === 'string') return error.sql
  return 'code' in error && typeof error.code === 'string' ? error.code : undefined
}

const CACHE_REVISION_CONFLICT = new Error('cache revision conflict')
type CacheTransaction = Parameters<Parameters<DBSchema['transaction']>[0]>[0]

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
  private readonly retryableRevisionErrorCode = 'ER_LOCK_DEADLOCK'
  private readonly revisionDeadlockRetries = 1
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
      .where(and(eq(cache.key, key), this.whereNotExpired()))
      .limit(1)
    return entry !== undefined
  }

  async get(key: string): Promise<any> {
    const [v]: { value: any }[] = await this.db
      .select({ value: cache.value })
      .from(cache)
      .where(and(eq(cache.key, key), this.whereNotExpired()))
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

  async readRevisionSnapshot(command: CacheRevisionSnapshotCommand): Promise<CacheRevisionSnapshot> {
    // Both branches share the same statement-level InnoDB read view.
    const rows: { key: string; value: unknown }[] = await unionAll(
      this.db
        .select({ key: cache.key, value: cache.value })
        .from(cache)
        .where(and(eq(cache.key, command.revisionKey), this.whereNotExpired())),
      this.db
        .select({ key: cache.key, value: cache.value })
        .from(cache)
        .where(
          and(ne(cache.key, command.revisionKey), sql`${cache.key} LIKE ${this.toLikePattern(command.pattern)} ESCAPE '='`, this.whereNotExpired())
        )
    )
    const revisionEntry = rows.find(({ key }) => key === command.revisionKey)
    let revision: string | null = null
    if (revisionEntry !== undefined) {
      const parsedRevision = this.parseRevision(revisionEntry.value)
      if (typeof parsedRevision !== 'string') {
        throw new Error(`Invalid cache revision for ${command.revisionKey}`)
      }
      revision = parsedRevision
    }
    return { revision, entries: rows.filter(({ key }) => key !== command.revisionKey) }
  }

  async commitRevision(command: CacheRevisionCommit): Promise<boolean> {
    return this.commitRevisionMutations(command, command.expectedRevision)
  }

  async mutateRevision(command: CacheRevisionMutationCommit): Promise<boolean> {
    return this.commitRevisionMutations(command)
  }

  private async commitRevisionMutations(command: CacheRevisionMutationCommit, expectedRevision?: string | null): Promise<boolean> {
    validateCacheRevisionCommand(command, this.defaultTTL)
    const mutations = [...command.mutations].sort((first, second) => (first.key < second.key ? -1 : first.key > second.key ? 1 : 0))

    for (let attempt = 0; ; attempt++) {
      try {
        await this.db.transaction(async (tx) => {
          // Rotate the namespace first. The write is the mutex and is rolled back with every failed precondition.
          await this.rotateRevision(tx, command.revisionKey, expectedRevision)

          if (expectedRevision === undefined && mutations.length === 1 && mutations[0].expect === 'present') {
            // The conditional UPDATE/DELETE validates the known lock incarnation without a preceding SELECT FOR UPDATE.
            await this.applyKnownMutation(tx, mutations[0])
            return
          }

          const entries = mutations.length
            ? await tx
                .select({
                  key: cache.key,
                  value: cache.value,
                  expiration: cache.expiration,
                  now: this.databaseTime().mapWith(Number)
                })
                .from(cache)
                .where(
                  inArray(
                    cache.key,
                    mutations.map(({ key }) => key)
                  )
                )
                .orderBy(cache.key)
                .for('update')
            : []
          const entriesByKey = new Map(entries.map((entry) => [entry.key, entry]))

          // Validate the complete locked snapshot before mutating any lock row.
          for (const mutation of mutations) {
            const entry = entriesByKey.get(mutation.key)
            const isPresent = entry !== undefined && (entry.expiration === this.infiniteExpiration || entry.expiration > entry.now)
            if ((mutation.expect === 'present') !== isPresent) throw CACHE_REVISION_CONFLICT
            if (mutation.expectedLockId !== undefined) {
              const value = dbParseJson(entry?.value)
              if (value === null || typeof value !== 'object' || value.lockId !== mutation.expectedLockId) {
                throw CACHE_REVISION_CONFLICT
              }
            }
          }

          const deleteKeys = mutations.filter((mutation) => mutation.type === 'delete').map(({ key }) => key)
          if (deleteKeys.length) await tx.delete(cache).where(inArray(cache.key, deleteKeys))

          const setMutations = mutations.filter((mutation): mutation is Extract<CacheRevisionMutation, { type: 'set' }> => mutation.type === 'set')
          if (setMutations.length) {
            await tx
              .insert(cache)
              .values(
                setMutations.map(({ key, value, ttl }) => ({
                  key,
                  value: this.serialize(value),
                  expiration: this.getDatabaseTTL(ttl)
                }))
              )
              .onDuplicateKeyUpdate({
                set: {
                  value: sql.raw('VALUES(`value`)'),
                  expiration: sql.raw('VALUES(`expiration`)')
                }
              })
          }
        })
        return true
      } catch (error) {
        if (error === CACHE_REVISION_CONFLICT) return false
        if (getMysqlError(error)?.code === this.retryableRevisionErrorCode && attempt < this.revisionDeadlockRetries) {
          this.logger.warn({ tag: this.commitRevisionMutations.name, msg: `Retrying ${command.revisionKey} after a database deadlock` })
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

  private readonly databaseTime: () => SQL<number> = () => sql<number>`UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))`

  private readonly whereNotExpired: () => SQL = () => notBetween(cache.expiration, 0, this.databaseTime())

  private readonly whereExpired: () => SQL = () => between(cache.expiration, 0, this.databaseTime())

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

  private async rotateRevision(tx: CacheTransaction, revisionKey: string, expectedRevision?: string | null): Promise<void> {
    const revision = randomUUID()
    if (expectedRevision === null) {
      try {
        await tx.insert(cache).values({ key: revisionKey, value: revision, expiration: this.infiniteExpiration })
      } catch (error) {
        if (getMysqlError(error)?.code === 'ER_DUP_ENTRY') throw CACHE_REVISION_CONFLICT
        throw error
      }
      return
    }

    // A known-lock mutation requires the permanent sidecar to exist; UPDATE avoids the insert path and its gap locks.
    const condition = expectedRevision === undefined ? eq(cache.key, revisionKey) : and(eq(cache.key, revisionKey), eq(cache.value, expectedRevision))
    const [result] = await tx.update(cache).set({ value: revision, expiration: this.infiniteExpiration }).where(condition)
    if (result.affectedRows !== 1) throw CACHE_REVISION_CONFLICT
  }

  private async applyKnownMutation(tx: CacheTransaction, mutation: CacheRevisionMutation): Promise<void> {
    const condition = and(
      eq(cache.key, mutation.key),
      this.whereNotExpired(),
      mutation.expectedLockId === undefined ? undefined : sql`JSON_UNQUOTE(JSON_EXTRACT(${cache.value}, '$.lockId')) = ${mutation.expectedLockId}`
    )
    if (mutation.type === 'delete') {
      const [result] = await tx.delete(cache).where(condition)
      if (result.affectedRows !== 1) throw CACHE_REVISION_CONFLICT
      return
    }

    const [result] = await tx
      .update(cache)
      .set({ value: this.serialize(mutation.value), expiration: this.getDatabaseTTL(mutation.ttl) })
      .where(condition)
    if (result.affectedRows === 1) return

    // An UPDATE that writes identical JSON and the same second-level TTL reports zero changed rows.
    const [unchangedEntry] = await tx.select({ key: cache.key }).from(cache).where(condition).limit(1)
    if (unchangedEntry === undefined) throw CACHE_REVISION_CONFLICT
  }

  private parseRevision(value: unknown): unknown {
    if (typeof value !== 'string') return value
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
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
