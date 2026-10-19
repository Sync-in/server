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
import { spacesRoots } from '../../spaces/schemas/spaces-roots.schema.js'
import { spaces } from '../../spaces/schemas/spaces.schema.js'
import type { UserModel } from '../../users/models/user.model.js'
import { users } from '../../users/schemas/users.schema.js'
import { sharesMembers } from '../schemas/shares-members.schema.js'
import { shares } from '../schemas/shares.schema.js'
import { SharesQueries } from './shares-queries.service.js'

describe('Shares queries (e2e)', () => {
  let module: TestingModule
  let db: DBSchema
  let sharesQueries: SharesQueries
  let actorId: number
  let ownerId: number
  let externalRootId: number
  let childId: number
  let grandchildId: number
  let internalRootId: number
  let pathSpaceId: number
  let spaceFileShareId: number
  let movedSpaceFileShareId: number
  let parentFileShareId: number
  let childFileShareId: number
  let movedChildFileShareId: number
  let sameFileChildShareId: number

  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const aliases = {
    root: `e2e-ext-root-${suffix}`,
    child: `e2e-ext-child-${suffix}`,
    grandchild: `e2e-ext-grandchild-${suffix}`,
    unauthorizedChild: `e2e-ext-unauthorized-${suffix}`,
    internalRoot: `e2e-internal-root-${suffix}`,
    malformedChild: `e2e-ext-malformed-${suffix}`,
    spaceFile: `e2e-space-file-${suffix}`,
    parentFile: `e2e-parent-file-${suffix}`,
    childFile: `e2e-child-file-${suffix}`,
    movedSpaceFile: `e2e-moved-space-file-${suffix}`,
    movedChildFile: `e2e-moved-child-file-${suffix}`,
    sameFileChild: `e2e-same-file-child-${suffix}`
  }
  const externalPath = `/e2e/external/${suffix}`
  const pathRootName = `root-[${suffix}`
  const movedPathRootName = `${pathRootName}-moved`
  const parentDirectoryName = 'notes['
  const movedParentDirectoryName = `${parentDirectoryName}-moved`
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

    actorId = dbGetInsertedId(
      await db.insert(users).values({
        login: `e2e-share-actor-${suffix}`,
        email: `e2e-share-actor-${suffix}@example.test`,
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
    await db.insert(shares).values({
      alias: aliases.unauthorizedChild,
      name: 'External child without membership',
      ownerId,
      parentId: externalRootId,
      externalPath
    })

    internalRootId = dbGetInsertedId(
      await db.insert(shares).values({ alias: aliases.internalRoot, name: 'Internal root', ownerId, externalPath: null })
    )
    const malformedChildId = dbGetInsertedId(
      await db.insert(shares).values({
        alias: aliases.malformedChild,
        name: 'Malformed external child',
        ownerId,
        parentId: internalRootId,
        externalPath
      })
    )

    await db.insert(sharesMembers).values([
      { shareId: externalRootId, userId: actorId, permissions: 'a:d:m:so' },
      { shareId: childId, userId: actorId, permissions: 'd:m' },
      { shareId: grandchildId, userId: actorId, permissions: 'm' },
      { shareId: malformedChildId, userId: actorId, permissions: 'd:m' }
    ])

    const pathRootFileId = dbGetInsertedId(await db.insert(files).values({ ownerId, path: '.', name: pathRootName, isDir: true }))
    const spaceTargetFileId = dbGetInsertedId(
      await db.insert(files).values({ ownerId, path: `${pathRootName.toUpperCase()}/${pathRootName}`, name: 'space-target.txt', isDir: false })
    )
    const movedSpaceTargetFileId = dbGetInsertedId(
      await db.insert(files).values({ ownerId, path: `${pathRootName}/before-move`, name: 'space-moved.txt', isDir: false })
    )
    pathSpaceId = dbGetInsertedId(await db.insert(spaces).values({ alias: `e2e-share-path-space-${suffix}`, name: 'Share path space' }))
    const pathSpaceRootId = dbGetInsertedId(
      await db.insert(spacesRoots).values({ spaceId: pathSpaceId, fileId: pathRootFileId, alias: 'anchor', name: 'Anchor' })
    )
    spaceFileShareId = dbGetInsertedId(
      await db.insert(shares).values({
        ownerId,
        spaceId: pathSpaceId,
        spaceRootId: pathSpaceRootId,
        fileId: spaceTargetFileId,
        alias: aliases.spaceFile,
        name: 'Space file share'
      })
    )
    movedSpaceFileShareId = dbGetInsertedId(
      await db.insert(shares).values({
        ownerId,
        spaceId: pathSpaceId,
        spaceRootId: pathSpaceRootId,
        fileId: movedSpaceTargetFileId,
        alias: aliases.movedSpaceFile,
        name: 'Moved space file share'
      })
    )
    await db.update(files).set({ path: movedPathRootName }).where(eq(files.id, movedSpaceTargetFileId))

    const parentFileId = dbGetInsertedId(await db.insert(files).values({ ownerId, path: pathRootName, name: parentDirectoryName, isDir: true }))
    const childFileId = dbGetInsertedId(
      await db.insert(files).values({
        ownerId,
        path: `${pathRootName.toUpperCase()}/${parentDirectoryName.toUpperCase()}/${parentDirectoryName}`,
        name: 'child.txt',
        isDir: false
      })
    )
    const movedChildFileId = dbGetInsertedId(
      await db.insert(files).values({ ownerId, path: `${pathRootName}/${parentDirectoryName}/before-move`, name: 'child-moved.txt', isDir: false })
    )
    parentFileShareId = dbGetInsertedId(
      await db.insert(shares).values({ ownerId, fileId: parentFileId, alias: aliases.parentFile, name: 'Parent file share' })
    )
    childFileShareId = dbGetInsertedId(
      await db.insert(shares).values({
        ownerId,
        parentId: parentFileShareId,
        fileId: childFileId,
        alias: aliases.childFile,
        name: 'Child file share'
      })
    )
    movedChildFileShareId = dbGetInsertedId(
      await db.insert(shares).values({
        ownerId,
        parentId: parentFileShareId,
        fileId: movedChildFileId,
        alias: aliases.movedChildFile,
        name: 'Moved child file share'
      })
    )
    await db
      .update(files)
      .set({ path: `${pathRootName}/${movedParentDirectoryName}` })
      .where(eq(files.id, movedChildFileId))
    sameFileChildShareId = dbGetInsertedId(
      await db.insert(shares).values({
        ownerId,
        parentId: parentFileShareId,
        fileId: parentFileId,
        alias: aliases.sameFileChild,
        name: 'Same file child share'
      })
    )
  })

  afterAll(async () => {
    try {
      const rootIds = [externalRootId, internalRootId].filter((id): id is number => Number.isInteger(id))
      if (rootIds.length) {
        await db.delete(shares).where(inArray(shares.id, rootIds))
      }
      if (pathSpaceId) await db.delete(spaces).where(eq(spaces.id, pathSpaceId))
      const userIds = [actorId, ownerId].filter((id): id is number => Number.isInteger(id))
      if (userIds.length) {
        await db.delete(users).where(inArray(users.id, userIds))
      }
    } finally {
      await module?.close()
    }
  })

  it('keeps descendant permissions while resolving the external root storage scope', async () => {
    const root = await sharesQueries.permissions(actorId, aliases.root)
    const child = await sharesQueries.permissions(actorId, aliases.child)
    const grandchild = await sharesQueries.permissions(actorId, aliases.grandchild)

    expect(root).toMatchObject({
      id: externalRootId,
      permissions: 'a:d:m:so',
      root: { externalPath, externalParentShareId: null }
    })
    expect(child).toMatchObject({
      id: childId,
      permissions: 'd:m',
      root: { externalPath, externalParentShareId: externalRootId }
    })
    expect(grandchild).toMatchObject({
      id: grandchildId,
      permissions: 'm',
      root: { externalPath, externalParentShareId: externalRootId }
    })
    expect(grandchild!.root!.externalParentShareId).not.toBe(childId)
  })

  it('uses the same external root scope without replacing each listed share permissions', async () => {
    const roots = await sharesQueries.shareRootFiles({ id: actorId, isAdmin: false } as UserModel, null)
    const child = roots.find((root) => root.root!.alias === aliases.child)
    const grandchild = roots.find((root) => root.root!.alias === aliases.grandchild)

    expect(child).toMatchObject({ origin: { shareExternalId: externalRootId }, root: { permissions: 'd:m' } })
    expect(grandchild).toMatchObject({ origin: { shareExternalId: externalRootId }, root: { permissions: 'm' } })
  })

  it('does not inherit access from an external parent without a child membership', async () => {
    await expect(sharesQueries.permissions(actorId, aliases.unauthorizedChild)).resolves.toBeUndefined()
  })

  it('fails closed when an external child has a non-external parent', async () => {
    await expect(sharesQueries.permissions(actorId, aliases.malformedChild)).resolves.toBeUndefined()

    const roots = await sharesQueries.shareRootFiles({ id: actorId, isAdmin: false } as UserModel, null)
    expect(roots.some((root) => root.root!.alias === aliases.malformedChild)).toBe(false)
  })

  it('resolves file paths literally from space and parent-share roots', async () => {
    const listedShares = await sharesQueries.listShares({ id: ownerId, isAdmin: false } as UserModel)

    expect(listedShares.find(({ id }) => id === spaceFileShareId)).toMatchObject({
      file: { path: `${pathRootName}/space-target.txt` }
    })
    expect(listedShares.find(({ id }) => id === childFileShareId)).toMatchObject({
      file: { path: 'notes[/child.txt' }
    })
    expect(listedShares.find(({ id }) => id === movedSpaceFileShareId)).toMatchObject({
      file: { path: `${movedPathRootName}/space-moved.txt` }
    })
    expect(listedShares.find(({ id }) => id === movedChildFileShareId)).toMatchObject({
      file: { path: `${pathRootName}/${movedParentDirectoryName}/child-moved.txt` }
    })
    expect(listedShares.find(({ id }) => id === sameFileChildShareId)).toMatchObject({
      file: { path: '.' }
    })
  })
})
