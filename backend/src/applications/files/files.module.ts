import { Module } from '@nestjs/common'
import { FilesContentStoreMySQL } from './adapters/files-content-store-mysql.service.js'
import { FileEditorsModule } from './editors/file-editors.module.js'
import { FilesOperationsController } from './files-operations.controller.js'
import { FilesTasksController } from './files-tasks.controller.js'
import { FilesController } from './files.controller.js'
import { FilesContentStore } from './models/files-content-store.js'
import { FilesContentIndexer } from './services/files-content-indexer.service.js'
import { FilesLockManager } from './services/files-lock-manager.service.js'
import { FilesManager } from './services/files-manager.service.js'
import { FilesMethods } from './services/files-methods.service.js'
import { FilesContentParser } from './services/files-content-parser.service.js'
import { FilesQueries } from './services/files-queries.service.js'
import { FilesRecents } from './services/files-recents.service.js'
import { FilesScheduler } from './services/files-scheduler.service.js'
import { FilesSearchManager } from './services/files-search-manager.service.js'
import { FilesTasksManager } from './services/tasks/files-tasks-manager.service.js'
import { FilesTasksQueue } from './services/tasks/files-tasks-queue.service.js'
import { FilesTasksTransfer } from './services/tasks/files-tasks-transfer.service.js'
import { FilesTasksWatcher } from './services/tasks/files-tasks-watcher.service.js'
import { FilesEventManager } from './services/files-event-manager.service.js'
import { FilesQuotaManager } from './services/files-quota-manager.service.js'
import { FilesTrashRetention } from './services/files-trash-retention.service.js'
import { FilesFavoritesManager } from './services/files-favorites-manager.service.js'
import { FilesFavoritesQueries } from './services/files-favorites-queries.service.js'

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
