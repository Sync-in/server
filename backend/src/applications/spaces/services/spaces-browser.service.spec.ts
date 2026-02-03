import { ConfigModule } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { exportConfiguration } from '../../../configuration/config.environment'
import { Cache } from '../../../infrastructure/cache/services/cache.service'
import { ContextManager } from '../../../infrastructure/context/services/context-manager.service'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import { FilesLockManager } from '../../files/services/files-lock-manager.service'
import { FilesQueries } from '../../files/services/files-queries.service'
import { FilesRecents } from '../../files/services/files-recents.service'
import { LinksQueries } from '../../links/services/links-queries.service'
import { NotificationsManager } from '../../notifications/services/notifications-manager.service'
import { SharesManager } from '../../shares/services/shares-manager.service'
import { SharesQueries } from '../../shares/services/shares-queries.service'
import { UsersQueries } from '../../users/services/users-queries.service'
import { SpacesBrowser } from './spaces-browser.service'
import { SpacesManager } from './spaces-manager.service'
import { SpacesQueries } from './spaces-queries.service'

describe(SpacesBrowser.name, () => {
  let spacesBrowserService: SpacesBrowser

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [await ConfigModule.forRoot({ load: [exportConfiguration], isGlobal: true })],
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
        SpacesManager,
        SpacesBrowser,
        SpacesQueries,
        SharesManager,
        SharesQueries,
        UsersQueries,
        FilesQueries,
        FilesLockManager,
        LinksQueries,
        FilesRecents
      ]
    }).compile()

    spacesBrowserService = module.get<SpacesBrowser>(SpacesBrowser)
  })

  it('should be defined', () => {
    expect(spacesBrowserService).toBeDefined()
  })
})
