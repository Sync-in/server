import { Module } from '@nestjs/common'
import { CollaboraOnlineManager } from './collabora-online-manager.service'
import { CollaboraOnlineController } from './collabora-online.controller'
import { CollaboraOnlineGuard } from './collabora-online.guard'
import { CollaboraOnlineStrategy } from './collabora-online.strategy'

@Module({
  controllers: [CollaboraOnlineController],
  providers: [CollaboraOnlineManager, CollaboraOnlineGuard, CollaboraOnlineStrategy]
})
export class CollaboraOnlineModule {}
