import { Test, TestingModule } from '@nestjs/testing'
import { Cache } from '../../infrastructure/cache/services/cache.service'
import { ContextManager } from '../../infrastructure/context/services/context-manager.service'
import { DB_TOKEN_PROVIDER } from '../../infrastructure/database/constants'
import { FilesLockManager } from '../files/services/files-lock-manager.service'
import { FilesQueries } from '../files/services/files-queries.service'
import { FilesRecents } from '../files/services/files-recents.service'
import { LinksQueries } from '../links/services/links-queries.service'
import { NotificationsManager } from '../notifications/services/notifications-manager.service'
import { SharesManager } from '../shares/services/shares-manager.service'
import { SharesQueries } from '../shares/services/shares-queries.service'
import { UsersQueries } from '../users/services/users-queries.service'
import { SpacesBrowser } from './services/spaces-browser.service'
import { SpacesManager } from './services/spaces-manager.service'
import { SpacesQueries } from './services/spaces-queries.service'
import { SpacesController } from './spaces.controller'

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
        ContextManager,
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
