import { Module } from '@nestjs/common'
import { configuration } from '../../configuration/config.environment'
import { FilesIndexerMySQL } from './adapters/files-indexer-mysql.service'
import { FilesTasksController } from './files-tasks.controller'
import { FilesController } from './files.controller'
import { FilesIndexer } from './models/files-indexer'
import { CollaboraOnlineModule } from './modules/collabora-online/collabora-online.module'
import { OnlyOfficeModule } from './modules/only-office/only-office.module'
import { FilesContentManager } from './services/files-content-manager.service'
import { FilesLockManager } from './services/files-lock-manager.service'
import { FilesManager } from './services/files-manager.service'
import { FilesMethods } from './services/files-methods.service'
import { FilesParser } from './services/files-parser.service'
import { FilesQueries } from './services/files-queries.service'
import { FilesRecents } from './services/files-recents.service'
import { FilesScheduler } from './services/files-scheduler.service'
import { FilesSearchManager } from './services/files-search-manager.service'
import { FilesTasksManager } from './services/files-tasks-manager.service'

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
    FilesContentManager,
    { provide: FilesIndexer, useClass: FilesIndexerMySQL },
    FilesSearchManager
  ],
  exports: [FilesManager, FilesQueries, FilesLockManager, FilesMethods, FilesRecents]
})
export class FilesModule {}
