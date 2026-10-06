import { Module } from '@nestjs/common'
import { LinksController } from '../links/links.controller.js'
import { LinksManager } from '../links/services/links-manager.service.js'
import { LinksQueries } from '../links/services/links-queries.service.js'
import { SharesManager } from './services/shares-manager.service.js'
import { SharesQueries } from './services/shares-queries.service.js'
import { SharesController } from './shares.controller.js'

@Module({
  controllers: [SharesController, LinksController],
  providers: [SharesManager, SharesQueries, LinksManager, LinksQueries],
  exports: [SharesManager, SharesQueries]
})
export class SharesModule {}
