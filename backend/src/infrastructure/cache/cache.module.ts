import { Global, Module } from '@nestjs/common'
import { configuration } from '../../configuration/config.environment.js'
import { MysqlCacheAdapter } from './adapters/mysql-cache.adapter.js'
import { RedisCacheAdapter } from './adapters/redis-cache.adapter.js'
import { Cache } from './cache.service.js'

@Global()
@Module({
  providers: [
    {
      provide: Cache,
      useClass: configuration.cache.adapter === 'mysql' ? MysqlCacheAdapter : RedisCacheAdapter
    }
  ],
  exports: [Cache]
})
export class CacheModule {}
