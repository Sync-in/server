import { Test, TestingModule } from '@nestjs/testing'
import { Cache } from '../../infrastructure/cache/services/cache.service'
import { ContextManager } from '../../infrastructure/context/services/context-manager.service'
import { DB_TOKEN_PROVIDER } from '../../infrastructure/database/constants'
import { FilesQueries } from '../files/services/files-queries.service'
import { LinksQueries } from '../links/services/links-queries.service'
import { NotificationsManager } from '../notifications/services/notifications-manager.service'
import { SpacesQueries } from '../spaces/services/spaces-queries.service'
import { UsersQueries } from '../users/services/users-queries.service'
import { SharesManager } from './services/shares-manager.service'
import { SharesQueries } from './services/shares-queries.service'
import { SharesController } from './shares.controller'

describe(SharesController.name, () => {
  let controller: SharesController

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SharesController],
      providers: [
        { provide: DB_TOKEN_PROVIDER, useValue: {} },
        {
          provide: Cache,
          useValue: {}
        },
        { provide: ContextManager, useValue: {} },
        {
          provide: NotificationsManager,
          useValue: {}
        },
        SpacesQueries,
        FilesQueries,
        UsersQueries,
        SharesManager,
        SharesQueries,
        LinksQueries
      ]
    }).compile()

    controller = module.get<SharesController>(SharesController)
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })
})
