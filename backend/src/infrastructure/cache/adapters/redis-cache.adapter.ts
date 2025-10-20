/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { RedisClientOptions } from '@redis/client'
import { createClient, RedisClientType } from 'redis'
import { createSlug } from '../../../common/shared'
import { configuration } from '../../../configuration/config.environment'
import { Cache } from '../services/cache.service'

@Injectable()
export class RedisCacheAdapter implements Cache, OnModuleInit {
  defaultTTL: number = configuration.cache.ttl
  infiniteExpiration = -1
  private readonly logger = new Logger(Cache.name.toUpperCase())
  private readonly client: RedisClientType
  private readonly reconnectOptions = { maxAttempts: 3, minConnectDelay: 1000, maxConnectDelay: 2000 }

  constructor() {
    this.client = createClient({
      url: configuration.cache.redis,
      socket: { noDelay: true, reconnectStrategy: this.reconnectStrategy }
    } satisfies RedisClientOptions)
  }

  async onModuleInit() {
    this.client.on('error', (e: Error) => this.logger.error(e.message || e))
    this.client.on('ready', () => this.logger.log(`Connected to Redis Server at ${this.client.options.url}`))
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
    for await (const keys of this.client.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      matches.push(...keys)
    }
    return matches
  }

  async get(key: string): Promise<any> {
    return this.deserialize(await this.client.get(key))
  }

  async mget(keys: string[]): Promise<(any | undefined)[]> {
    return (await this.client.mGet(keys)).map((v) => this.deserialize(v))
  }

  async set(key: string, data: unknown, ttl?: number): Promise<boolean> {
    const exp = this.getTTL(ttl)
    return (await this.client.set(key, this.serialize(data), { expiration: { type: 'EX', value: exp === -1 ? undefined : exp } })) === 'OK'
  }

  async del(key: any): Promise<boolean> {
    return (await this.client.unlink(key)) > 0
  }

  async mdel(keys: string[]): Promise<boolean> {
    const multi = this.client.multi()
    for (const key of keys) {
      multi.unlink(key)
    }
    const res = await multi.exec()
    return Array.isArray(res) && res.some((r) => typeof r === 'number' && r > 0)
  }

  genSlugKey(...args: any[]): string {
    return createSlug(args.join(' '))
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
}
