import { Module } from '@nestjs/common'
import { FavoritesController } from './favorites.controller'
import { FavoritesManager } from './services/favorites-manager.service'

@Module({
  controllers: [FavoritesController],
  providers: [FavoritesManager]
})
export class FavoritesModule {}
