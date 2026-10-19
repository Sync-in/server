import { Test, TestingModule } from '@nestjs/testing'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { AvailabilityModule } from '../../../infrastructure/availability/availability.module.js'
import type { Cache } from '../../../infrastructure/cache/cache.service.js'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants.js'
import { DatabaseModule } from '../../../infrastructure/database/database.module.js'
import type { DBSchema } from '../../../infrastructure/database/interfaces/database.interface.js'
import { dbGetInsertedId } from '../../../infrastructure/database/utils.js'
import { files } from '../../files/schemas/files.schema.js'
import { shares } from '../../shares/schemas/shares.schema.js'
import { spacesRoots } from '../../spaces/schemas/spaces-roots.schema.js'
import { spaces } from '../../spaces/schemas/spaces.schema.js'
import { users } from '../../users/schemas/users.schema.js'
import { SYNC_CLIENT_TYPE, SYNC_PATH_CONFLICT_MODE, SYNC_PATH_DIFF_MODE, SYNC_PATH_MODE, SYNC_PATH_SCHEDULER_UNIT } from '../constants/sync.js'
import type { SyncPathSettings } from '../interfaces/sync-path.interface.js'
import { syncClients } from '../schemas/sync-clients.schema.js'
import { syncPaths } from '../schemas/sync-paths.schema.js'
import { SyncQueries } from './sync-queries.service.js'

describe('Sync queries (e2e)', () => {
  let module: TestingModule
  let db: DBSchema
  let syncQueries: SyncQueries
  let ownerId: number
  let spaceId: number
  let shareId: number

  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const rootName = `sync-root-[${suffix}`
  const nestedName = 'nested.+'
  const movedParentPath = `${rootName}-moved`
  const spaceAlias = `e2e-sync-space-${suffix}`
  const shareAlias = `e2e-sync-share-${suffix}`
  const syncClientId = randomUUID()
  const noCache = {
    genSlugKey: vi.fn((...args: unknown[]) => args.join(':')),
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(true)
  } as unknown as Cache

  beforeAll(async () => {
    module = await Test.createTestingModule({ imports: [AvailabilityModule, DatabaseModule] }).compile()
    module.useLogger(['fatal'])
    db = await module.resolve<DBSchema>(DB_TOKEN_PROVIDER)
    syncQueries = new SyncQueries(db, noCache)

    ownerId = dbGetInsertedId(
      await db.insert(users).values({
        login: `e2e-sync-owner-${suffix}`,
        email: `e2e-sync-owner-${suffix}@example.test`,
        password: 'password'
      })
    )

    const rootFileId = dbGetInsertedId(await db.insert(files).values({ ownerId, path: '.', name: rootName, isDir: true }))
    const directChildFileId = dbGetInsertedId(await db.insert(files).values({ ownerId, path: rootName.toUpperCase(), name: nestedName, isDir: true }))
    const activeFileId = dbGetInsertedId(
      await db
        .insert(files)
        .values({ ownerId, path: `${rootName.toUpperCase()}/${nestedName}`, name: 'active.txt', isDir: false, mime: 'text/plain' })
    )
    const movedFileId = dbGetInsertedId(
      await db.insert(files).values({ ownerId, path: movedParentPath, name: 'moved', isDir: true, mime: 'inode/directory' })
    )
    spaceId = dbGetInsertedId(await db.insert(spaces).values({ alias: spaceAlias, name: 'Sync space' }))
    const spaceRootId = dbGetInsertedId(await db.insert(spacesRoots).values({ spaceId, fileId: rootFileId, alias: 'anchor', name: 'Anchor' }))
    shareId = dbGetInsertedId(await db.insert(shares).values({ ownerId, fileId: rootFileId, alias: shareAlias, name: 'Sync share' }))

    await db.insert(syncClients).values({
      id: syncClientId,
      ownerId,
      token: randomUUID(),
      tokenExpiration: Number.MAX_SAFE_INTEGER,
      info: {
        node: 'Sync client',
        os: 'test',
        osRelease: 'test',
        user: 'test',
        type: SYNC_CLIENT_TYPE.DESKTOP,
        version: 'test'
      }
    })
    const settings: SyncPathSettings = {
      name: 'Sync path',
      localPath: '/sync',
      remotePath: '',
      permissions: '',
      mode: SYNC_PATH_MODE.BOTH,
      ignoreDelete: false,
      enabled: true,
      diffMode: SYNC_PATH_DIFF_MODE.FAST,
      conflictMode: SYNC_PATH_CONFLICT_MODE.RECENT,
      filters: [],
      scheduler: { value: 0, unit: SYNC_PATH_SCHEDULER_UNIT.DISABLED },
      timestamp: 0,
      lastSync: new Date(0)
    }
    await db.insert(syncPaths).values([
      {
        clientId: syncClientId,
        spaceId,
        spaceRootId,
        fileId: activeFileId,
        settings: {
          ...settings,
          name: 'Space sync',
          localPath: '/sync/space',
          remotePath: `spaces/${spaceAlias}/anchor/${nestedName}/active.txt`
        }
      },
      {
        clientId: syncClientId,
        shareId,
        fileId: activeFileId,
        settings: {
          ...settings,
          name: 'Share sync',
          localPath: '/sync/share',
          remotePath: `shares/${shareAlias}/${nestedName}/active.txt`
        }
      },
      {
        clientId: syncClientId,
        spaceId,
        spaceRootId,
        fileId: directChildFileId,
        settings: {
          ...settings,
          name: 'Direct child space sync',
          localPath: '/sync/direct-child-space',
          remotePath: `spaces/${spaceAlias}/anchor/${nestedName}`
        }
      },
      {
        clientId: syncClientId,
        shareId,
        fileId: directChildFileId,
        settings: {
          ...settings,
          name: 'Direct child share sync',
          localPath: '/sync/direct-child-share',
          remotePath: `shares/${shareAlias}/${nestedName}`
        }
      },
      {
        clientId: syncClientId,
        spaceId,
        spaceRootId,
        fileId: movedFileId,
        settings: {
          ...settings,
          name: 'Moved space sync',
          localPath: '/sync/moved-space',
          remotePath: `spaces/${spaceAlias}/anchor/moved`
        }
      },
      {
        clientId: syncClientId,
        shareId,
        fileId: movedFileId,
        settings: {
          ...settings,
          name: 'Moved share sync',
          localPath: '/sync/moved-share',
          remotePath: `shares/${shareAlias}/moved`
        }
      }
    ])
  })

  afterAll(async () => {
    try {
      if (shareId) await db.delete(shares).where(eq(shares.id, shareId))
      if (spaceId) await db.delete(spaces).where(eq(spaces.id, spaceId))
      if (ownerId) await db.delete(users).where(eq(users.id, ownerId))
    } finally {
      await module?.close()
    }
  })

  it('resolves sync paths through an anchored space and a direct share', async () => {
    const paths = await syncQueries.getPaths(syncClientId)

    expect(paths).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ remotePath: `spaces/${spaceAlias}/anchor/${nestedName}/active.txt` }),
        expect.objectContaining({ remotePath: `shares/${shareAlias}/${nestedName}/active.txt` }),
        expect.objectContaining({ remotePath: `spaces/${spaceAlias}/anchor/${nestedName}` }),
        expect.objectContaining({ remotePath: `shares/${shareAlias}/${nestedName}` }),
        expect.objectContaining({ remotePath: `spaces/${spaceAlias}/${movedParentPath}/moved` }),
        expect.objectContaining({ remotePath: `shares/${movedParentPath}/moved` })
      ])
    )
  })
})
