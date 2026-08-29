import { Test, TestingModule } from '@nestjs/testing'
import { eq, inArray } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type { Cache } from '../../../infrastructure/cache/cache.service'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import { DatabaseModule } from '../../../infrastructure/database/database.module'
import type { DBSchema } from '../../../infrastructure/database/interfaces/database.interface'
import { dbGetInsertedId } from '../../../infrastructure/database/utils'
import { comments } from '../../comments/schemas/comments.schema'
import { CommentsQueries } from '../../comments/services/comments-queries.service'
import { sharesMembers } from '../../shares/schemas/shares-members.schema'
import { shares } from '../../shares/schemas/shares.schema'
import { SharesQueries } from '../../shares/services/shares-queries.service'
import { SPACE_ALIAS } from '../../spaces/constants/spaces'
import { spacesMembers } from '../../spaces/schemas/spaces-members.schema'
import { spacesRoots } from '../../spaces/schemas/spaces-roots.schema'
import { spaces } from '../../spaces/schemas/spaces.schema'
import { SpacesQueries } from '../../spaces/services/spaces-queries.service'
import { SYNC_CLIENT_TYPE, SYNC_PATH_CONFLICT_MODE, SYNC_PATH_DIFF_MODE, SYNC_PATH_MODE, SYNC_PATH_SCHEDULER_UNIT } from '../../sync/constants/sync'
import { syncClients } from '../../sync/schemas/sync-clients.schema'
import { syncPaths } from '../../sync/schemas/sync-paths.schema'
import { users } from '../../users/schemas/users.schema'
import { FILE_REPOSITORY } from '../constants/operations'
import { filesFavorites } from '../schemas/files-favorites.schema'
import { files } from '../schemas/files.schema'
import { FilesFavoritesQueries } from './files-favorites-queries.service'
import { FilesQueries } from './files-queries.service'

describe('Files favorites queries (e2e)', () => {
  let module: TestingModule
  let db: DBSchema
  let favoritesQueries: FilesFavoritesQueries
  let commentsQueries: CommentsQueries
  let spacesQueries: SpacesQueries
  let sharesQueries: SharesQueries
  let ownerId: number | undefined
  let memberId: number | undefined
  let spaceId: number | undefined
  let shareId: number | undefined
  let rootFileId: number | undefined
  let activeFileId: number | undefined
  let trashedFileId: number | undefined
  let syncPathId: number | undefined

  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const rootName = `favorite-root-${suffix}`
  const spaceAlias = `e2e-favorite-space-${suffix}`
  const shareAlias = `e2e-favorite-share-${suffix}`
  const syncClientId = randomUUID()
  const noCache = {
    genSlugKey: vi.fn((...args: unknown[]) => args.join(':')),
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(true)
  } as unknown as Cache

  beforeAll(async () => {
    module = await Test.createTestingModule({ imports: [DatabaseModule] }).compile()
    module.useLogger(['fatal'])
    db = await module.resolve<DBSchema>(DB_TOKEN_PROVIDER)
    const filesQueries = new FilesQueries(db)
    favoritesQueries = new FilesFavoritesQueries(db)
    spacesQueries = new SpacesQueries(db, noCache, filesQueries)
    sharesQueries = new SharesQueries(db, noCache)
    commentsQueries = new CommentsQueries(db, spacesQueries, sharesQueries)

    ownerId = dbGetInsertedId(
      await db.insert(users).values({
        login: `e2e-favorite-owner-${suffix}`,
        email: `e2e-favorite-owner-${suffix}@example.test`,
        password: 'password'
      })
    )
    memberId = dbGetInsertedId(
      await db.insert(users).values({
        login: `e2e-favorite-member-${suffix}`,
        email: `e2e-favorite-member-${suffix}@example.test`,
        password: 'password'
      })
    )

    rootFileId = dbGetInsertedId(await db.insert(files).values({ ownerId, path: '.', name: rootName, isDir: true }))
    activeFileId = dbGetInsertedId(await db.insert(files).values({ ownerId, path: rootName, name: 'active.txt', isDir: false }))
    trashedFileId = dbGetInsertedId(await db.insert(files).values({ ownerId, path: rootName, name: 'trashed.txt', isDir: false, inTrash: true }))
    spaceId = dbGetInsertedId(await db.insert(spaces).values({ alias: spaceAlias, name: 'Favorite space' }))
    await db.insert(spacesRoots).values({ spaceId, fileId: rootFileId, alias: 'anchor', name: 'Anchor' })
    await db.insert(spacesMembers).values({ spaceId, userId: memberId, permissions: 'a:d:m:so' })

    shareId = dbGetInsertedId(await db.insert(shares).values({ ownerId, fileId: rootFileId, alias: shareAlias, name: 'Favorite share' }))
    await db.insert(sharesMembers).values({ shareId, userId: memberId, permissions: 'd:m' })
    await db.insert(syncClients).values({
      id: syncClientId,
      ownerId,
      token: randomUUID(),
      tokenExpiration: Number.MAX_SAFE_INTEGER,
      info: {
        node: 'Favorite client',
        os: 'test',
        osRelease: 'test',
        user: 'test',
        type: SYNC_CLIENT_TYPE.DESKTOP,
        version: 'test'
      }
    })
    syncPathId = dbGetInsertedId(
      await db.insert(syncPaths).values({
        clientId: syncClientId,
        ownerId,
        fileId: rootFileId,
        settings: {
          name: 'Favorite sync',
          localPath: '/favorites',
          remotePath: `personal/${rootName}`,
          permissions: '',
          mode: SYNC_PATH_MODE.BOTH,
          enabled: true,
          diffMode: SYNC_PATH_DIFF_MODE.FAST,
          conflictMode: SYNC_PATH_CONFLICT_MODE.RECENT,
          filters: [],
          scheduler: { value: 0, unit: SYNC_PATH_SCHEDULER_UNIT.DISABLED },
          timestamp: 0,
          lastSync: new Date(0)
        }
      })
    )
    await db.insert(filesFavorites).values([
      { userId: ownerId, fileId: rootFileId },
      { userId: ownerId, fileId: trashedFileId },
      { userId: memberId, fileId: trashedFileId },
      { userId: memberId, fileId: activeFileId }
    ])
    await db.insert(comments).values([
      { userId: ownerId, fileId: trashedFileId, content: 'Comment from owner' },
      { userId: memberId, fileId: trashedFileId, content: 'Comment from member' }
    ])
  })

  afterAll(async () => {
    try {
      if (shareId) await db.delete(shares).where(eq(shares.id, shareId))
      if (spaceId) await db.delete(spaces).where(eq(spaces.id, spaceId))
      const userIds = [ownerId, memberId].filter((id): id is number => Number.isInteger(id))
      if (userIds.length) await db.delete(users).where(inArray(users.id, userIds))
    } finally {
      await module?.close()
    }
  })

  it('resolves an active anchored file through its accessible space and direct share', async () => {
    const [spaceIds, shareIds] = await Promise.all([
      spacesQueries.spaceIdentities(memberId).then((identities) => identities.map(({ id }) => id)),
      sharesQueries.shareIdentities(memberId, 0).then((identities) => identities.map(({ id }) => id))
    ])
    const [spaceLocations, shareLocations] = await Promise.all([
      favoritesQueries.getFavoriteLocationsFromSpaces(memberId, spaceIds),
      favoritesQueries.getFavoriteLocationsFromShares(memberId, shareIds)
    ])

    expect(spaceLocations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fileId: activeFileId,
          repository: FILE_REPOSITORY.SPACE,
          path: `files/${spaceAlias}/anchor`,
          displayRootName: 'Favorite space'
        })
      ])
    )
    expect(shareLocations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fileId: activeFileId,
          repository: FILE_REPOSITORY.SHARE,
          path: `shares/${shareAlias}`,
          displayRootName: 'Favorite share'
        })
      ])
    )
  })

  it('returns browser details', async () => {
    const favorites = await favoritesQueries.getFavoritesFromUser(ownerId, true, true)
    const rootFavorite = favorites.find(({ fileId }) => fileId === rootFileId)
    const commentedFavorite = favorites.find(({ fileId }) => fileId === trashedFileId)

    expect(rootFavorite).toEqual(
      expect.objectContaining({
        spaces: [{ id: spaceId, alias: spaceAlias, name: 'Favorite space' }],
        shares: [{ id: shareId, alias: shareAlias, name: 'Favorite share', type: 0 }],
        syncs: [{ id: syncPathId, clientId: syncClientId, clientName: 'Favorite client' }],
        hasComments: false
      })
    )
    expect(commentedFavorite).toEqual(expect.objectContaining({ hasComments: true }))

    const favoritesWithoutSyncs = await favoritesQueries.getFavoritesFromUser(ownerId, true, false)
    const rootFavoriteWithoutSyncs = favoritesWithoutSyncs.find(({ fileId }) => fileId === rootFileId)
    expect(rootFavoriteWithoutSyncs).toEqual(
      expect.objectContaining({
        spaces: [{ id: spaceId, alias: spaceAlias, name: 'Favorite space' }],
        shares: [{ id: shareId, alias: shareAlias, name: 'Favorite share', type: 0 }]
      })
    )
    expect(rootFavoriteWithoutSyncs).not.toHaveProperty('syncs')
  })

  it('does not resolve a trashed child through its former space anchor', async () => {
    const spaceIds = (await spacesQueries.spaceIdentities(memberId)).map(({ id }) => id)
    const locations = await favoritesQueries.getFavoriteLocationsFromSpaces(memberId, spaceIds)

    expect(spaceIds).toContain(spaceId)
    expect(locations.some(({ fileId }) => fileId === trashedFileId)).toBe(false)
    await expect(commentsQueries.getRecentsFromSpaces(memberId, spaceIds, 10)).resolves.toEqual([])

    await expect(favoritesQueries.getFavoritesFromUser(ownerId, true, true)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fileId: trashedFileId, repository: SPACE_ALIAS.PERSONAL, path: `trash/personal/${rootName}`, isDisabled: false })
      ])
    )
    await expect(commentsQueries.getRecentsFromPersonal(ownerId, 10)).resolves.toEqual([
      expect.objectContaining({ file: expect.objectContaining({ path: `trash/personal/${rootName}` }) })
    ])
  })

  it('does not resolve a trashed child through its former share', async () => {
    const shareIds = (await sharesQueries.shareIdentities(memberId, 0)).map(({ id }) => id)
    const locations = await favoritesQueries.getFavoriteLocationsFromShares(memberId, shareIds)

    expect(shareIds).toContain(shareId)
    expect(locations.some(({ fileId }) => fileId === trashedFileId)).toBe(false)
    await expect(commentsQueries.getRecentsFromShares(memberId, shareIds, 10)).resolves.toEqual([])
  })
})
