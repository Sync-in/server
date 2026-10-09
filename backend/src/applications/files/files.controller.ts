import { Body, Controller, Delete, Get, Post, Query, Search, UseGuards } from '@nestjs/common'
import { SkipSpacePermissionsCheck } from '../spaces/decorators/space-skip-permissions.decorator.js'
import { GetSpace } from '../spaces/decorators/space.decorator.js'
import { SpaceGuard } from '../spaces/guards/space.guard.js'
import { SpaceEnv } from '../spaces/models/space-env.model.js'
import { USER_ROLE } from '../users/constants/user.js'
import { UserHaveRole } from '../users/decorators/roles.decorator.js'
import { GetUser } from '../users/decorators/user.decorator.js'
import { UserRolesGuard } from '../users/guards/roles.guard.js'
import { UserModel } from '../users/models/user.model.js'
import { FILES_RECENTS_DEFAULT_LIMIT, FILES_RECENTS_MAX_LIMIT } from './constants/recents.js'
import { FILES_ROUTE } from './constants/routes.js'
import { type DeleteFileFavoriteDto, deleteFileFavoriteSchema, type FileFavoriteDto, fileFavoriteSchema } from './dto/file-favorite.dto.js'
import { searchFilesSchema, type ValidatedSearchFilesDto } from './dto/file-operations.dto.js'
import { filesRecentsLimitQuerySchema } from './files.schema.js'
import { IndexingStatus } from './interfaces/indexing.interface.js'
import { FileContent } from './schemas/file-content.interface.js'
import type { FileFavorite, FileFavoriteIdentity } from './schemas/file-favorite.interface.js'
import type { FileRecent } from './schemas/file-recent.interface.js'
import { FilesContentIndexer } from './services/files-content-indexer.service.js'
import { FilesFavoritesManager } from './services/files-favorites-manager.service.js'
import { FilesRecents } from './services/files-recents.service.js'
import { FilesSearchManager } from './services/files-search-manager.service.js'

@Controller(FILES_ROUTE.BASE)
export class FilesController {
  constructor(
    private readonly filesRecents: FilesRecents,
    private readonly filesSearch: FilesSearchManager,
    private readonly filesContentIndexer: FilesContentIndexer,
    private readonly filesFavoritesManager: FilesFavoritesManager
  ) {}

  // FAVORITES

  @Get(FILES_ROUTE.FAVORITES)
  @UserHaveRole(USER_ROLE.GUEST)
  @UseGuards(UserRolesGuard)
  getFavorites(@GetUser() user: UserModel): Promise<FileFavorite[]> {
    return this.filesFavoritesManager.getFavorites(user)
  }

  @Post(`${FILES_ROUTE.FAVORITES}/*`)
  // only writes user metadata; SpaceGuard still resolves and validates access to the requested location.
  @SkipSpacePermissionsCheck()
  @UserHaveRole(USER_ROLE.GUEST)
  @UseGuards(SpaceGuard, UserRolesGuard)
  addFavorite(
    @GetUser() user: UserModel,
    @GetSpace() space: SpaceEnv,
    @Body({ schema: fileFavoriteSchema }) favoriteDto: FileFavoriteDto
  ): Promise<FileFavoriteIdentity> {
    return this.filesFavoritesManager.addFavorite(user, space, favoriteDto.fileId)
  }

  @Delete(FILES_ROUTE.FAVORITES)
  @UserHaveRole(USER_ROLE.GUEST)
  @UseGuards(UserRolesGuard)
  removeFavorite(@GetUser() user: UserModel, @Body({ schema: deleteFileFavoriteSchema }) favoriteDto: DeleteFileFavoriteDto): Promise<void> {
    return this.filesFavoritesManager.removeFavorite(user, favoriteDto.fileId)
  }

  // RECENT FILES

  @Get(FILES_ROUTE.RECENTS)
  getRecents(
    @GetUser() user: UserModel,
    @Query('limit', { schema: filesRecentsLimitQuerySchema }) limit: number = FILES_RECENTS_DEFAULT_LIMIT
  ): Promise<FileRecent[]> {
    return this.filesRecents.getRecents(user, Math.min(limit, FILES_RECENTS_MAX_LIMIT))
  }

  // SEARCH FILES

  @Search(FILES_ROUTE.SEARCH)
  search(@GetUser() user: UserModel, @Body({ schema: searchFilesSchema }) search: ValidatedSearchFilesDto): Promise<FileContent[]> {
    return this.filesSearch.search(user, search)
  }

  // CONTENT INDEXING (requires ADMIN role)

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
