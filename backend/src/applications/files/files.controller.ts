import { Body, Controller, Delete, Get, Post, Query, Search, UseGuards } from '@nestjs/common'
import { SkipSpacePermissionsCheck } from '../spaces/decorators/space-skip-permissions.decorator'
import { GetSpace } from '../spaces/decorators/space.decorator'
import { SpaceGuard } from '../spaces/guards/space.guard'
import { SpaceEnv } from '../spaces/models/space-env.model'
import { USER_ROLE } from '../users/constants/user'
import { UserHaveRole } from '../users/decorators/roles.decorator'
import { GetUser } from '../users/decorators/user.decorator'
import { UserRolesGuard } from '../users/guards/roles.guard'
import { UserModel } from '../users/models/user.model'
import { FILES_ROUTE } from './constants/routes'
import { DeleteFileFavoriteDto, FileFavoriteDto } from './dto/file-favorite.dto'
import { SearchFilesDto } from './dto/file-operations.dto'
import { IndexingStatus } from './interfaces/indexing.interface'
import { FileContent } from './schemas/file-content.interface'
import type { FileFavorite, FileFavoriteIdentity } from './schemas/file-favorite.interface'
import { FileRecent } from './schemas/file-recent.interface'
import { FilesContentIndexer } from './services/files-content-indexer.service'
import { FilesFavoritesManager } from './services/files-favorites-manager.service'
import { FilesRecents } from './services/files-recents.service'
import { FilesSearchManager } from './services/files-search-manager.service'

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
  addFavorite(@GetUser() user: UserModel, @GetSpace() space: SpaceEnv, @Body() favoriteDto: FileFavoriteDto): Promise<FileFavoriteIdentity> {
    return this.filesFavoritesManager.addFavorite(user, space, favoriteDto.fileId)
  }

  @Delete(FILES_ROUTE.FAVORITES)
  @UserHaveRole(USER_ROLE.GUEST)
  @UseGuards(UserRolesGuard)
  removeFavorite(@GetUser() user: UserModel, @Body() favoriteDto: DeleteFileFavoriteDto): Promise<void> {
    return this.filesFavoritesManager.removeFavorite(user, favoriteDto.fileId)
  }

  // RECENT FILES

  @Get(FILES_ROUTE.RECENTS)
  getRecents(@GetUser() user: UserModel, @Query('limit') limit: number = 10): Promise<FileRecent[]> {
    return this.filesRecents.getRecents(user, limit)
  }

  // SEARCH FILES

  @Search(FILES_ROUTE.SEARCH)
  search(@GetUser() user: UserModel, @Body() search: SearchFilesDto): Promise<FileContent[]> {
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
