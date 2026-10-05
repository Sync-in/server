import { Module } from '@nestjs/common'
import { FilesContentStoreMySQL } from './adapters/files-content-store-mysql.service'
import { FileEditorsModule } from './editors/file-editors.module'
import { FilesOperationsController } from './files-operations.controller'
import { FilesTasksController } from './files-tasks.controller'
import { FilesController } from './files.controller'
import { FilesContentStore } from './models/files-content-store'
import { FilesContentIndexer } from './services/files-content-indexer.service'
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
import { FilesFavoritesManager } from './services/files-favorites-manager.service'
import { FilesFavoritesQueries } from './services/files-favorites-queries.service'

@Module({
  imports: [FileEditorsModule.register()],
  controllers: [FilesOperationsController, FilesController, FilesTasksController],
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
    FilesContentIndexer,
    { provide: FilesContentStore, useClass: FilesContentStoreMySQL },
    FilesSearchManager,
    FilesEventManager,
    FilesQuotaManager,
    FilesTrashRetention,
    FilesFavoritesQueries,
    FilesFavoritesManager
  ],
  exports: [FilesManager, FilesQueries, FilesLockManager, FilesQuotaManager, FilesMethods, FilesRecents]
})
export class FilesModule {}
