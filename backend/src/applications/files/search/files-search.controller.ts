import { Body, Controller, Delete, Get, Post, Search, UseGuards } from '@nestjs/common'
import { USER_ROLE } from '../../users/constants/user.js'
import { UserHaveRole } from '../../users/decorators/roles.decorator.js'
import { GetUser } from '../../users/decorators/user.decorator.js'
import { UserRolesGuard } from '../../users/guards/roles.guard.js'
import { UserModel } from '../../users/models/user.model.js'
import { FILES_ROUTE } from '../core/constants/routes.js'
import { searchFilesSchema, type ValidatedSearchFilesDto } from '../operations/dto/file-operations.dto.js'
import { IndexingStatus } from './interfaces/indexing.interface.js'
import { FileContent } from './schemas/file-content.interface.js'
import { FilesContentIndexer } from './services/files-content-indexer.service.js'
import { FilesSearchManager } from './services/files-search-manager.service.js'

@Controller(FILES_ROUTE.BASE)
export class FilesSearchController {
  constructor(
    private readonly filesSearch: FilesSearchManager,
    private readonly filesContentIndexer: FilesContentIndexer
  ) {}

  @Search(FILES_ROUTE.SEARCH)
  search(@GetUser() user: UserModel, @Body({ schema: searchFilesSchema }) search: ValidatedSearchFilesDto): Promise<FileContent[]> {
    return this.filesSearch.search(user, search)
  }

  @Get(FILES_ROUTE.INDEXING)
  @UserHaveRole(USER_ROLE.ADMINISTRATOR)
  @UseGuards(UserRolesGuard)
  status(): Promise<IndexingStatus> {
    return this.filesContentIndexer.status()
  }

  @Post(`${FILES_ROUTE.INDEXING}/${FILES_ROUTE.INDEXING_START}`)
  @UserHaveRole(USER_ROLE.ADMINISTRATOR)
  @UseGuards(UserRolesGuard)
  startIndexing(): Promise<boolean> {
    return this.filesContentIndexer.startIndexing()
  }

  @Post(`${FILES_ROUTE.INDEXING}/${FILES_ROUTE.INDEXING_STOP}`)
  @UserHaveRole(USER_ROLE.ADMINISTRATOR)
  @UseGuards(UserRolesGuard)
  stopIndexing(): Promise<boolean> {
    return this.filesContentIndexer.stopIndexing()
  }

  @Delete(FILES_ROUTE.INDEXING)
  @UserHaveRole(USER_ROLE.ADMINISTRATOR)
  @UseGuards(UserRolesGuard)
  dropIndexes(): Promise<void> {
    return this.filesContentIndexer.dropIndexes()
  }
}
