import { Test, TestingModule } from '@nestjs/testing'
import { Cache } from '../../infrastructure/cache/cache.service.js'
import { DB_TOKEN_PROVIDER } from '../../infrastructure/database/constants.js'
import { FilesLockManager } from '../files/services/files-lock-manager.service.js'
import { FilesQueries } from '../files/services/files-queries.service.js'
import { FilesRecents } from '../files/services/files-recents.service.js'
import { LinksQueries } from '../links/services/links-queries.service.js'
import { NotificationsManager } from '../notifications/services/notifications-manager.service.js'
import { SharesManager } from '../shares/services/shares-manager.service.js'
import { SharesQueries } from '../shares/services/shares-queries.service.js'
import { UsersQueries } from '../users/services/users-queries.service.js'
import { SpacesBrowser } from './services/spaces-browser.service.js'
import { SpacesManager } from './services/spaces-manager.service.js'
import { SpacesQueries } from './services/spaces-queries.service.js'
import { SpacesController } from './spaces.controller.js'
import { FilesQuotaManager } from '../files/services/files-quota-manager.service.js'

describe(SpacesController.name, () => {
  let spacesController: SpacesController

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SpacesController],
      providers: [
        { provide: DB_TOKEN_PROVIDER, useValue: {} },
        {
          provide: NotificationsManager,
          useValue: {}
        },
        {
          provide: Cache,
          useValue: {}
        },
        {
          provide: FilesQuotaManager,
          useValue: {}
        },
        SpacesManager,
        SpacesQueries,
        SpacesBrowser,
        SharesManager,
        SharesQueries,
        FilesQueries,
        FilesLockManager,
        UsersQueries,
        LinksQueries,
        FilesRecents
      ]
    }).compile()

    spacesController = module.get<SpacesController>(SpacesController)
  })

  it('should be defined', () => {
    expect(spacesController).toBeDefined()
  })
})
