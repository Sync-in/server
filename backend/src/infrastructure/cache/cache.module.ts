/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Global, Module } from '@nestjs/common'
import { SchedulerRegistry } from '@nestjs/schedule'
import { configuration } from '../../configuration/config.environment'
import { MysqlCacheAdapter } from './adapters/mysql-cache.adapter'
import { RedisCacheAdapter } from './adapters/redis-cache.adapter'
import { Cache } from './services/cache.service'

@Global()
@Module({
  providers: [
    {
      provide: Cache,
      useClass: configuration.cache.adapter === 'mysql' ? MysqlCacheAdapter : RedisCacheAdapter
    },
    SchedulerRegistry
  ],
  exports: [Cache]
})
export class CacheModule {}
