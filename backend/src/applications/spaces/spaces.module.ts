import { Module } from '@nestjs/common'
import { SpaceGuard } from './guards/space.guard'
import { SpacesBrowser } from './services/spaces-browser.service'
import { SpacesManager } from './services/spaces-manager.service'
import { SpacesQueries } from './services/spaces-queries.service'
import { SpacesScheduler } from './services/spaces-scheduler.service'
import { SpacesController } from './spaces.controller'

@Module({
  controllers: [SpacesController],
  providers: [SpaceGuard, SpacesManager, SpacesBrowser, SpacesQueries, SpacesScheduler],
  exports: [SpaceGuard, SpacesManager, SpacesBrowser, SpacesQueries]
})
export class SpacesModule {}
