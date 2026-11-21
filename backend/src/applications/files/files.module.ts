import { Module } from '@nestjs/common'
import { FilesContentStoreMySQL } from './search/services/adapters/files-content-store-mysql.service.js'
import { FileEditorsModule } from './editors/file-editors.module.js'
import { FilesFavoritesController } from './favorites/files-favorites.controller.js'
import { FilesOperationsController } from './operations/files-operations.controller.js'
import { FilesRecentsController } from './recents/files-recents.controller.js'
import { FilesSearchController } from './search/files-search.controller.js'
import { FilesTasksController } from './tasks/files-tasks.controller.js'
import { FilesContentStore } from './search/models/files-content-store.js'
import { FilesContentIndexer } from './search/services/files-content-indexer.service.js'
import { FilesLockManager } from './locks/services/files-lock-manager.service.js'
import { FilesManager } from './core/services/files-manager.service.js'
import { FilesMethods } from './operations/services/files-methods.service.js'
import { FilesContentParser } from './search/services/files-content-parser.service.js'
import { FilesQueries } from './core/services/files-queries.service.js'
import { FilesRecents } from './recents/services/files-recents.service.js'
import { FilesScheduler } from './core/services/files-scheduler.service.js'
import { FilesSearchManager } from './search/services/files-search-manager.service.js'
import { FilesTasksManager } from './tasks/services/files-tasks-manager.service.js'
import { FilesTasksQueue } from './tasks/services/files-tasks-queue.service.js'
import { FilesTasksTransfer } from './tasks/services/files-tasks-transfer.service.js'
import { FilesTasksWatcher } from './tasks/services/files-tasks-watcher.service.js'
import { FilesEventManager } from './core/services/files-event-manager.service.js'
import { FilesQuotaManager } from './quota/services/files-quota-manager.service.js'
import { FilesTrashRetention } from './trash/services/files-trash-retention.service.js'
import { FilesFavoritesManager } from './favorites/services/files-favorites-manager.service.js'
import { FilesFavoritesQueries } from './favorites/services/files-favorites-queries.service.js'
import { FilesUploadSessionManager } from './operations/services/files-upload-session-manager.service.js'

@Module({
  imports: [FileEditorsModule.register()],
  controllers: [FilesOperationsController, FilesTasksController, FilesFavoritesController, FilesRecentsController, FilesSearchController],
  providers: [
    FilesMethods,
    FilesUploadSessionManager,
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
  exports: [FilesManager, FilesQueries, FilesLockManager, FilesQuotaManager, FilesMethods, FilesRecents, FilesUploadSessionManager]
})
export class FilesModule {}
