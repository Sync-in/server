import { Module } from '@nestjs/common'
import { configuration } from '../../configuration/config.environment'
import { FilesContentStoreMySQL } from './adapters/files-content-store-mysql.service'
import { FilesTasksController } from './files-tasks.controller'
import { FilesController } from './files.controller'
import { FilesContentStore } from './models/files-content-store'
import { CollaboraOnlineModule } from './modules/collabora-online/collabora-online.module'
import { OnlyOfficeModule } from './modules/only-office/only-office.module'
import { FilesContentIndexer } from './services/files-content-indexer.service'
import { FilesLockManager } from './services/files-lock-manager.service'
import { FilesManager } from './services/files-manager.service'
import { FilesMethods } from './services/files-methods.service'
import { FilesParser } from './services/files-parser.service'
import { FilesQueries } from './services/files-queries.service'
import { FilesRecents } from './services/files-recents.service'
import { FilesScheduler } from './services/files-scheduler.service'
import { FilesSearchManager } from './services/files-search-manager.service'
import { FilesTasksManager } from './services/files-tasks-manager.service'
import { FilesEventManager } from './services/files-event-manager.service'
import { FilesQuotaManager } from './services/files-quota-manager.service'

@Module({
  imports: [
    ...(configuration.applications.files.onlyoffice.enabled ? [OnlyOfficeModule] : []),
    ...(configuration.applications.files.collabora.enabled ? [CollaboraOnlineModule] : [])
  ],
  controllers: [FilesController, FilesTasksController],
  providers: [
    FilesMethods,
    FilesManager,
    FilesQueries,
    FilesLockManager,
    FilesTasksManager,
    FilesScheduler,
    FilesRecents,
    FilesParser,
    FilesContentIndexer,
    { provide: FilesContentStore, useClass: FilesContentStoreMySQL },
    FilesSearchManager,
    FilesEventManager,
    FilesQuotaManager
  ],
  exports: [FilesManager, FilesQueries, FilesLockManager, FilesQuotaManager, FilesMethods, FilesRecents]
})
export class FilesModule {}
