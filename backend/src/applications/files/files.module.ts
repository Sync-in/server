import { Module } from '@nestjs/common'
import { configuration } from '../../configuration/config.environment'
import { FilesContentStoreMySQL } from './adapters/files-content-store-mysql.service'
import { FilesTasksController } from './files-tasks.controller'
import { FilesController } from './files.controller'
import { FilesContentStore } from './models/files-content-store'
import { CollaboraOnlineModule } from './editors/collabora-online/collabora-online.module'
import { OnlyOfficeModule } from './editors/only-office/only-office.module'
import { FilesContentIndexer } from './services/files-content-indexer.service'
import { FilesFavorites } from './services/files-favorites.service'
import { FilesLockManager } from './services/files-lock-manager.service'
import { FilesManager } from './services/files-manager.service'
import { FilesMethods } from './services/files-methods.service'
import { FilesContentParser } from './services/files-content-parser.service'
import { FilesQueries } from './services/files-queries.service'
import { FilesRecents } from './services/files-recents.service'
import { FilesScheduler } from './services/files-scheduler.service'
import { FilesSearchManager } from './services/files-search-manager.service'
import { FilesTasksManager } from './services/tasks/files-tasks-manager.service'
import { FilesTasksQueue } from './services/tasks/files-tasks-queue.service'
import { FilesTasksTransfer } from './services/tasks/files-tasks-transfer.service'
import { FilesTasksWatcher } from './services/tasks/files-tasks-watcher.service'
import { FilesEventManager } from './services/files-event-manager.service'
import { FilesQuotaManager } from './services/files-quota-manager.service'
import { FilesTrashRetention } from './services/files-trash-retention.service'

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
    FilesTasksQueue,
    FilesTasksTransfer,
    FilesTasksWatcher,
    FilesScheduler,
    FilesRecents,
    FilesContentParser,
    FilesFavorites,
    FilesContentIndexer,
    { provide: FilesContentStore, useClass: FilesContentStoreMySQL },
    FilesSearchManager,
    FilesEventManager,
    FilesQuotaManager,
    FilesTrashRetention
  ],
  exports: [FilesManager, FilesQueries, FilesLockManager, FilesQuotaManager, FilesMethods, FilesRecents, FilesFavorites]
})
export class FilesModule {}
