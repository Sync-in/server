import { Test, TestingModule } from '@nestjs/testing'
import { eq, inArray } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { AvailabilityModule } from '../../infrastructure/availability/availability.module.js'
import type { Cache } from '../../infrastructure/cache/cache.service.js'
import { DB_TOKEN_PROVIDER } from '../../infrastructure/database/constants.js'
import { DatabaseModule } from '../../infrastructure/database/database.module.js'
import type { DBSchema } from '../../infrastructure/database/interfaces/database.interface.js'
import { dbGetInsertedId } from '../../infrastructure/database/utils.js'
import { comments } from '../comments/schemas/comments.schema.js'
import { CommentsQueries } from '../comments/services/comments-queries.service.js'
import { filesFavorites } from '../files/schemas/files-favorites.schema.js'
import { files } from '../files/schemas/files.schema.js'
import { FilesFavoritesQueries } from '../files/services/files-favorites-queries.service.js'
import { FilesQueries } from '../files/services/files-queries.service.js'
import { SpacesQueries } from '../spaces/services/spaces-queries.service.js'
import { users } from '../users/schemas/users.schema.js'
import { SharesQueries } from './services/shares-queries.service.js'
import { sharesMembers } from './schemas/shares-members.schema.js'
import { shares } from './schemas/shares.schema.js'

describe('Shares (e2e)', () => {
  let module: TestingModule
  let db: DBSchema
  let sharesQueries: SharesQueries
  let childActorId: number
  let ownerId: number
  let externalRootId: number
  let childId: number
  let grandchildId: number
  let externalFileId: number

  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const aliases = {
    root: `e2e-ext-root-${suffix}`,
    child: `e2e-ext-child-${suffix}`,
    grandchild: `e2e-ext-grandchild-${suffix}`
  }
  const externalPath = `/e2e/external/${suffix}`
  const noCache = {
    genSlugKey: vi.fn((...args: unknown[]) => args.join(':')),
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(true)
  } as unknown as Cache

  beforeAll(async () => {
    module = await Test.createTestingModule({ imports: [AvailabilityModule, DatabaseModule] }).compile()
    module.useLogger(['fatal'])
    db = await module.resolve<DBSchema>(DB_TOKEN_PROVIDER)
    sharesQueries = new SharesQueries(db, noCache)

    childActorId = dbGetInsertedId(
      await db.insert(users).values({
        login: `e2e-share-child-actor-${suffix}`,
        email: `e2e-share-child-actor-${suffix}@example.test`,
        password: 'password'
      })
    )
    ownerId = dbGetInsertedId(
      await db.insert(users).values({
        login: `e2e-share-owner-${suffix}`,
        email: `e2e-share-owner-${suffix}@example.test`,
        password: 'password'
      })
    )

    externalRootId = dbGetInsertedId(await db.insert(shares).values({ alias: aliases.root, name: 'External root', ownerId: null, externalPath }))
    childId = dbGetInsertedId(
      await db.insert(shares).values({
        alias: aliases.child,
        name: 'External child',
        ownerId,
        parentId: externalRootId,
        externalPath
      })
    )
    grandchildId = dbGetInsertedId(
      await db.insert(shares).values({
        alias: aliases.grandchild,
        name: 'External grandchild',
        ownerId,
        parentId: childId,
        externalPath
      })
    )
    await db.insert(sharesMembers).values([
      { shareId: childId, userId: childActorId, permissions: 'd:m' },
      { shareId: grandchildId, userId: childActorId, permissions: 'm' }
    ])

    externalFileId = dbGetInsertedId(
      await db.insert(files).values({ shareExternalId: externalRootId, path: '.', name: 'external-file.txt', isDir: false })
    )
    await db.insert(filesFavorites).values({ userId: childActorId, fileId: externalFileId })
    await db.insert(comments).values({ userId: ownerId, fileId: externalFileId, content: 'External child comment' })
  })

  afterAll(async () => {
    try {
      if (externalRootId) await db.delete(shares).where(eq(shares.id, externalRootId))
      const userIds = [childActorId, ownerId].filter((id): id is number => Number.isInteger(id))
      if (userIds.length) await db.delete(users).where(inArray(users.id, userIds))
    } finally {
      await module?.close()
    }
  })

  it('resolves favorite and recent-comment locations through an external child only', async () => {
    const favoritesQueries = new FilesFavoritesQueries(db)
    const spacesQueries = new SpacesQueries(db, noCache, new FilesQueries(db))
    const commentsQueries = new CommentsQueries(db, spacesQueries, sharesQueries)
    const shareIds = (await sharesQueries.shareIdentities(childActorId, 0)).map(({ id }) => id)

    expect(shareIds).toEqual(expect.arrayContaining([childId, grandchildId]))
    expect(shareIds).not.toContain(externalRootId)

    const favorites = await favoritesQueries.getFavoriteLocationsFromShares(childActorId, shareIds)
    const recentComments = await commentsQueries.getRecentsFromShares(childActorId, shareIds, 10)

    expect(favorites).toEqual([
      expect.objectContaining({ fileId: externalFileId, path: `shares/${aliases.child}`, displayRootName: 'External child' })
    ])
    expect(recentComments).toEqual([
      expect.objectContaining({ file: expect.objectContaining({ path: `shares/${aliases.child}`, displayRootName: 'External child' }) })
    ])
  })
})
