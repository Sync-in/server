import { Module } from '@nestjs/common'
import { CollaboraOnlineManager } from './collabora-online-manager.service.js'
import { CollaboraOnlineController } from './collabora-online.controller.js'
import { CollaboraOnlineGuard } from './collabora-online.guard.js'
import { CollaboraOnlineStrategy } from './collabora-online.strategy.js'

@Module({
  controllers: [CollaboraOnlineController],
  providers: [CollaboraOnlineManager, CollaboraOnlineGuard, CollaboraOnlineStrategy]
})
export class CollaboraOnlineModule {}
