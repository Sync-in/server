import { Test, TestingModule } from '@nestjs/testing'
import { Cache } from '../../infrastructure/cache/cache.service.js'
import { DB_TOKEN_PROVIDER } from '../../infrastructure/database/constants.js'
import { FilesQueries } from '../files/services/files-queries.service.js'
import { LinksQueries } from '../links/services/links-queries.service.js'
import { NotificationsManager } from '../notifications/services/notifications-manager.service.js'
import { SpacesQueries } from '../spaces/services/spaces-queries.service.js'
import { UsersQueries } from '../users/services/users-queries.service.js'
import { SharesManager } from './services/shares-manager.service.js'
import { SharesQueries } from './services/shares-queries.service.js'
import { SharesController } from './shares.controller.js'
import { FilesQuotaManager } from '../files/services/files-quota-manager.service.js'

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
        {
          provide: NotificationsManager,
          useValue: {}
        },
        {
          provide: FilesQuotaManager,
          useValue: { updateStorageQuota: () => vi.fn() }
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
