import { Module } from '@nestjs/common'
import { LinksController } from '../links/links.controller'
import { LinksManager } from '../links/services/links-manager.service'
import { LinksQueries } from '../links/services/links-queries.service'
import { SharesManager } from './services/shares-manager.service'
import { SharesQueries } from './services/shares-queries.service'
import { SharesController } from './shares.controller'

@Module({
  controllers: [SharesController, LinksController],
  providers: [SharesManager, SharesQueries, LinksManager, LinksQueries],
  exports: [SharesManager, SharesQueries]
})
export class SharesModule {}
