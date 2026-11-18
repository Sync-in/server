import { Body, Controller, Delete, Get, Post, UseGuards } from '@nestjs/common'
import { SkipSpacePermissionsCheck } from '../../spaces/decorators/space-skip-permissions.decorator.js'
import { GetSpace } from '../../spaces/decorators/space.decorator.js'
import { SpaceGuard } from '../../spaces/guards/space.guard.js'
import { SpaceEnv } from '../../spaces/models/space-env.model.js'
import { USER_ROLE } from '../../users/constants/user.js'
import { UserHaveRole } from '../../users/decorators/roles.decorator.js'
import { GetUser } from '../../users/decorators/user.decorator.js'
import { UserRolesGuard } from '../../users/guards/roles.guard.js'
import { UserModel } from '../../users/models/user.model.js'
import { FILES_ROUTE } from '../core/constants/routes.js'
import { type DeleteFileFavoriteDto, deleteFileFavoriteSchema, type FileFavoriteDto, fileFavoriteSchema } from './dto/file-favorite.dto.js'
import type { FileFavorite, FileFavoriteIdentity } from './schemas/file-favorite.interface.js'
import { FilesFavoritesManager } from './services/files-favorites-manager.service.js'

@Controller(FILES_ROUTE.BASE)
export class FilesFavoritesController {
  constructor(private readonly filesFavoritesManager: FilesFavoritesManager) {}

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
}
