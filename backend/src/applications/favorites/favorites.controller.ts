import { Controller, Delete, Get, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common'
import { SkipSpaceGuard } from '../spaces/decorators/space-skip-guard.decorator'
import { SkipSpacePermissionsCheck } from '../spaces/decorators/space-skip-permissions.decorator'
import { GetSpace } from '../spaces/decorators/space.decorator'
import { SpaceGuard } from '../spaces/guards/space.guard'
import { SpaceEnv } from '../spaces/models/space-env.model'
import { GetUser } from '../users/decorators/user.decorator'
import type { UserModel } from '../users/models/user.model'
import type { FileFavorite } from '../files/schemas/file-favorite.interface'
import { FAVORITES_ROUTE } from './constants/routes'
import { FavoritesManager } from './services/favorites-manager.service'

@Controller(FAVORITES_ROUTE.BASE)
@SkipSpacePermissionsCheck()
@UseGuards(SpaceGuard)
export class FavoritesController {
  constructor(private readonly favoritesManager: FavoritesManager) {}

  @Get()
  @SkipSpaceGuard()
  getFavorites(@GetUser() user: UserModel, @Query('limit', new ParseIntPipe({ optional: true })) limit?: number): Promise<FileFavorite[]> {
    return this.favoritesManager.getFavorites(user, limit)
  }

  @Post(`${FAVORITES_ROUTE.SPACES}/*`)
  addFavorite(@GetUser() user: UserModel, @GetSpace() space: SpaceEnv): Promise<FileFavorite> {
    return this.favoritesManager.addFavorite(user, space)
  }

  @Delete(`${FAVORITES_ROUTE.SPACES}/*`)
  removeFavorite(@GetUser() user: UserModel, @GetSpace() space: SpaceEnv): Promise<void> {
    return this.favoritesManager.removeFavorite(user, space)
  }
}
