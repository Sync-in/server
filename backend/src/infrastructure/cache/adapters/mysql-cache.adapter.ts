/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Inject, Injectable, Logger } from '@nestjs/common'
import { SchedulerRegistry } from '@nestjs/schedule'
import { CronJob } from 'cron'
import { and, between, eq, exists, inArray, like, notBetween, SQL } from 'drizzle-orm'
import cluster from 'node:cluster'
import { createSlug, currentTimeStamp } from '../../../common/shared'
import { configuration } from '../../../configuration/config.environment'
import { DB_TOKEN_PROVIDER } from '../../database/constants'
import { DBSchema } from '../../database/interfaces/database.interface'
import { dbCheckAffectedRows } from '../../database/utils'
import { MysqlCache } from '../schemas/mysql-cache.interface'
import { cache } from '../schemas/mysql-cache.schema'
import { Cache } from '../services/cache.service'

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
  ) {
    this.initScheduler().catch((e: Error) => this.logger.error(e))
  }

  async initScheduler(): Promise<void> {
    if (!cluster.worker || cluster.worker.id === 1) {
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

  async keys(pattern: string): Promise<string[]> {
    const ks = await this.db
      .select({ key: cache.key })
      .from(cache)
      .where(and(like(cache.key, pattern.replaceAll('*', '%')), this.whereNotExpired()))
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
    const vs: { value: any }[] = await this.db
      .select({ value: cache.value })
      .from(cache)
      .where(and(inArray(cache.key, keys), this.whereNotExpired()))
    return vs.map((v: { value: any }) => v.value)
  }

  async set(key: any, data: any, ttl?: number): Promise<boolean> {
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
      this.logger.error(`${this.set.name} - ${e}`)
      return false
    }
  }

  async del(key: string): Promise<boolean> {
    return dbCheckAffectedRows(await this.db.delete(cache).where(eq(cache.key, key)), 1, false)
  }

  async mdel(keys: string[]): Promise<boolean> {
    return dbCheckAffectedRows(await this.db.delete(cache).where(inArray(cache.key, keys)), keys.length, false)
  }

  genSlugKey(...args: any[]): string {
    return createSlug(args.join(' '))
  }

  async quit(): Promise<void> {
    this.logger.verbose(`${this.quit.name}`)
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

  private async clearExpiredKeys() {
    try {
      await this.db.delete(cache).where(this.whereExpired())
    } catch (e) {
      this.logger.error(`${this.clearExpiredKeys.name} - ${e?.code || e}`)
    }
  }
}
