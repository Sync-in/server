import { Module } from '@nestjs/common'
import { SyncDiffGzipBodyInterceptor } from './interceptors/sync-diff-gzip-body.interceptor.js'
import { SyncClientsManager } from './services/sync-clients-manager.service.js'
import { SyncManager } from './services/sync-manager.service.js'
import { SyncPathsManager } from './services/sync-paths-manager.service.js'
import { SyncQueries } from './services/sync-queries.service.js'
import { SyncController } from './sync.controller.js'

@Module({
  controllers: [SyncController],
  providers: [SyncDiffGzipBodyInterceptor, SyncClientsManager, SyncQueries, SyncPathsManager, SyncManager]
})
export class SyncModule {}
