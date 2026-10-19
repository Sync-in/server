import { Test, TestingModule } from '@nestjs/testing'
import { eq, inArray } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { AvailabilityModule } from '../../../infrastructure/availability/availability.module.js'
import type { Cache } from '../../../infrastructure/cache/cache.service.js'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants.js'
import { DatabaseModule } from '../../../infrastructure/database/database.module.js'
import type { DBSchema } from '../../../infrastructure/database/interfaces/database.interface.js'
import { dbGetInsertedId } from '../../../infrastructure/database/utils.js'
import { files } from '../../files/schemas/files.schema.js'
import { FilesQueries } from '../../files/services/files-queries.service.js'
import { sharesMembers } from '../../shares/schemas/shares-members.schema.js'
import { shares } from '../../shares/schemas/shares.schema.js'
import { SharesQueries } from '../../shares/services/shares-queries.service.js'
import { spacesMembers } from '../../spaces/schemas/spaces-members.schema.js'
import { spacesRoots } from '../../spaces/schemas/spaces-roots.schema.js'
import { spaces } from '../../spaces/schemas/spaces.schema.js'
import { SpacesQueries } from '../../spaces/services/spaces-queries.service.js'
import { users } from '../../users/schemas/users.schema.js'
import { comments } from '../schemas/comments.schema.js'
import { CommentsQueries } from './comments-queries.service.js'

describe('Comments queries (e2e)', () => {
  let module: TestingModule
  let db: DBSchema
  let commentsQueries: CommentsQueries
  let ownerId: number
  let memberId: number
  let spaceId: number
  let shareId: number

  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const rootName = `comments-root-[${suffix}`
  const caseEquivalentRootName = rootName.toUpperCase()
  const siblingRootName = `${rootName}-sibling`
  const nestedName = 'nested.+'
  const spaceAlias = `e2e-comments-space-${suffix}`
  const shareAlias = `e2e-comments-share-${suffix}`
  const noCache = {
    genSlugKey: vi.fn((...args: unknown[]) => args.join(':')),
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(true)
  } as unknown as Cache

  beforeAll(async () => {
    module = await Test.createTestingModule({ imports: [AvailabilityModule, DatabaseModule] }).compile()
    module.useLogger(['fatal'])
    db = await module.resolve<DBSchema>(DB_TOKEN_PROVIDER)
    const filesQueries = new FilesQueries(db)
    const spacesQueries = new SpacesQueries(db, noCache, filesQueries)
    const sharesQueries = new SharesQueries(db, noCache)
    commentsQueries = new CommentsQueries(db, spacesQueries, sharesQueries)

    ownerId = dbGetInsertedId(
      await db.insert(users).values({
        login: `e2e-comments-owner-${suffix}`,
        email: `e2e-comments-owner-${suffix}@example.test`,
        password: 'password'
      })
    )
    memberId = dbGetInsertedId(
      await db.insert(users).values({
        login: `e2e-comments-member-${suffix}`,
        email: `e2e-comments-member-${suffix}@example.test`,
        password: 'password'
      })
    )

    const rootFileId = dbGetInsertedId(await db.insert(files).values({ ownerId, path: '.', name: rootName, isDir: true }))
    const anchoredFileId = dbGetInsertedId(
      await db
        .insert(files)
        .values({ ownerId, path: `${caseEquivalentRootName}/${nestedName}`, name: 'anchored.txt', isDir: false, mime: 'text/plain' })
    )
    const siblingFileId = dbGetInsertedId(
      await db.insert(files).values({ ownerId, path: `${siblingRootName}/${nestedName}`, name: 'outside.txt', isDir: false, mime: 'text/plain' })
    )
    spaceId = dbGetInsertedId(await db.insert(spaces).values({ alias: spaceAlias, name: 'Comments space' }))
    const nativeFileId = dbGetInsertedId(
      await db.insert(files).values({ spaceId, path: 'native-folder', name: 'native.txt', isDir: false, mime: 'text/plain' })
    )
    await db.insert(spacesRoots).values({ spaceId, fileId: rootFileId, alias: 'anchor', name: 'Anchor' })
    await db.insert(spacesMembers).values({ spaceId, userId: memberId, permissions: 'a:d:m:so' })

    shareId = dbGetInsertedId(await db.insert(shares).values({ ownerId, fileId: rootFileId, alias: shareAlias, name: 'Comments share' }))
    await db.insert(sharesMembers).values({ shareId, userId: memberId, permissions: 'd:m' })
    await db.insert(comments).values([
      { userId: ownerId, fileId: anchoredFileId, content: 'Anchored comment' },
      { userId: ownerId, fileId: nativeFileId, content: 'Native space comment' },
      { userId: ownerId, fileId: siblingFileId, content: 'Sibling comment' }
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

  it('resolves comments from an anchored root and native files in the same space', async () => {
    const recentComments = await commentsQueries.getRecentsFromSpaces(memberId, [spaceId], 10)

    expect(recentComments).toHaveLength(2)
    expect(recentComments.some(({ content }) => content === 'Sibling comment')).toBe(false)
    expect(recentComments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content: 'Anchored comment',
          file: expect.objectContaining({ path: `files/${spaceAlias}/anchor/${nestedName}`, name: 'anchored.txt' })
        }),
        expect.objectContaining({
          content: 'Native space comment',
          file: expect.objectContaining({ path: `files/${spaceAlias}/native-folder`, name: 'native.txt' })
        })
      ])
    )
  })

  it('resolves comments from a direct share', async () => {
    const recentComments = await commentsQueries.getRecentsFromShares(memberId, [shareId], 10)

    expect(recentComments.some(({ content }) => content === 'Sibling comment')).toBe(false)
    expect(recentComments).toEqual([
      expect.objectContaining({
        content: 'Anchored comment',
        file: expect.objectContaining({ path: `shares/${shareAlias}/${nestedName}`, name: 'anchored.txt' })
      })
    ])
  })
})
