import { Module } from '@nestjs/common'
import { SpaceGuard } from './guards/space.guard.js'
import { SpacesBrowser } from './services/spaces-browser.service.js'
import { SpacesManager } from './services/spaces-manager.service.js'
import { SpacesQueries } from './services/spaces-queries.service.js'
import { SpacesScheduler } from './services/spaces-scheduler.service.js'
import { SpacesController } from './spaces.controller.js'

@Module({
  controllers: [SpacesController],
  providers: [SpaceGuard, SpacesManager, SpacesBrowser, SpacesQueries, SpacesScheduler],
  exports: [SpaceGuard, SpacesManager, SpacesBrowser, SpacesQueries]
})
export class SpacesModule {}
