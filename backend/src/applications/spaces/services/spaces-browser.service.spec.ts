import { ConfigModule } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import fs from 'node:fs/promises'
import { configuration, exportConfiguration } from '../../../configuration/config.environment'
import { Cache } from '../../../infrastructure/cache/cache.service'
import { ContextManager } from '../../../infrastructure/context/services/context-manager.service'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import { FilesQuotaManager } from '../../files/services/files-quota-manager.service'
import { FilesLockManager } from '../../files/services/files-lock-manager.service'
import { FilesQueries } from '../../files/services/files-queries.service'
import { FilesRecents } from '../../files/services/files-recents.service'
import { LinksQueries } from '../../links/services/links-queries.service'
import { NotificationsManager } from '../../notifications/services/notifications-manager.service'
import { SharesManager } from '../../shares/services/shares-manager.service'
import { SharesQueries } from '../../shares/services/shares-queries.service'
import type { UserModel } from '../../users/models/user.model'
import { UsersQueries } from '../../users/services/users-queries.service'
import type { SpaceEnv } from '../models/space-env.model'
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
        { provide: FilesQuotaManager, useValue: {} },
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

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should be defined', () => {
    expect(spacesBrowserService).toBeDefined()
  })

  it('should expose the space name while preserving its alias', async () => {
    const user = { id: 1 } as UserModel
    const space = {
      alias: 'communication',
      name: 'Communication',
      inSharesList: false,
      inTrashRepository: false,
      browsePermissions: vi.fn().mockReturnValue('a:m')
    } as unknown as SpaceEnv

    vi.spyOn(spacesBrowserService as any, 'parseFS').mockResolvedValue([])
    vi.spyOn(spacesBrowserService as any, 'parseDB').mockResolvedValue([])
    vi.spyOn(spacesBrowserService as any, 'parseRootFiles').mockResolvedValue([])
    vi.spyOn((spacesBrowserService as any).filesRecents, 'updateRecents').mockResolvedValue(undefined)

    const result = await spacesBrowserService.browse(user, space)

    expect(result.space).toEqual({ alias: 'communication', name: 'Communication' })
  })

  it('always hides internal temporary entries from filesystem browsing', async () => {
    const showHiddenFiles = configuration.applications.files.showHiddenFiles
    configuration.applications.files.showHiddenFiles = true
    vi.spyOn(fs, 'readdir').mockResolvedValue([
      { name: '.sync-in-tmp', isDirectory: () => true, isFile: () => false },
      { name: '.sync-in.uploading', isDirectory: () => false, isFile: () => true },
      { name: '.visible', isDirectory: () => false, isFile: () => true }
    ] as any)
    vi.spyOn(fs, 'stat').mockResolvedValue({
      ino: 1,
      size: 7,
      birthtime: new Date(0),
      mtime: new Date(0),
      isDirectory: () => false
    } as any)
    const names: string[] = []

    try {
      for await (const file of (spacesBrowserService as any).parsePath({ realPath: '/storage', relativeUrl: '/space' })) {
        names.push(file.name)
      }
    } finally {
      configuration.applications.files.showHiddenFiles = showHiddenFiles
    }

    expect(names).toEqual(['.visible'])
  })
})
