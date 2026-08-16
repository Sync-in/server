import { Test, TestingModule } from '@nestjs/testing'
import { inArray } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type { Cache } from '../../infrastructure/cache/cache.service'
import { DB_TOKEN_PROVIDER } from '../../infrastructure/database/constants'
import { DatabaseModule } from '../../infrastructure/database/database.module'
import type { DBSchema } from '../../infrastructure/database/interfaces/database.interface'
import { dbGetInsertedId } from '../../infrastructure/database/utils'
import type { UserModel } from '../users/models/user.model'
import { users } from '../users/schemas/users.schema'
import { SharesQueries } from './services/shares-queries.service'
import { sharesMembers } from './schemas/shares-members.schema'
import { shares } from './schemas/shares.schema'

describe('Shares (e2e)', () => {
  let module: TestingModule
  let db: DBSchema
  let sharesQueries: SharesQueries
  let actorId: number | undefined
  let ownerId: number | undefined
  let externalRootId: number | undefined
  let childId: number | undefined
  let grandchildId: number | undefined
  let internalRootId: number | undefined

  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const aliases = {
    root: `e2e-ext-root-${suffix}`,
    child: `e2e-ext-child-${suffix}`,
    grandchild: `e2e-ext-grandchild-${suffix}`,
    unauthorizedChild: `e2e-ext-unauthorized-${suffix}`,
    internalRoot: `e2e-internal-root-${suffix}`,
    malformedChild: `e2e-ext-malformed-${suffix}`
  }
  const externalPath = `/e2e/external/${suffix}`
  const noCache = {
    genSlugKey: vi.fn((...args: unknown[]) => args.join(':')),
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(true)
  } as unknown as Cache

  beforeAll(async () => {
    module = await Test.createTestingModule({ imports: [DatabaseModule] }).compile()
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
  })

  afterAll(async () => {
    try {
      const rootIds = [externalRootId, internalRootId].filter((id): id is number => Number.isInteger(id))
      if (rootIds.length) {
        await db.delete(shares).where(inArray(shares.id, rootIds))
      }
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
    expect(grandchild.root.externalParentShareId).not.toBe(childId)
  })

  it('uses the same external root scope without replacing each listed share permissions', async () => {
    const roots = await sharesQueries.shareRootFiles({ id: actorId, isAdmin: false } as UserModel, {})
    const child = roots.find((root) => root.root.alias === aliases.child)
    const grandchild = roots.find((root) => root.root.alias === aliases.grandchild)

    expect(child).toMatchObject({ origin: { shareExternalId: externalRootId }, root: { permissions: 'd:m' } })
    expect(grandchild).toMatchObject({ origin: { shareExternalId: externalRootId }, root: { permissions: 'm' } })
  })

  it('does not inherit access from an external parent without a child membership', async () => {
    await expect(sharesQueries.permissions(actorId, aliases.unauthorizedChild)).resolves.toBeUndefined()
  })

  it('fails closed when an external child has a non-external parent', async () => {
    await expect(sharesQueries.permissions(actorId, aliases.malformedChild)).resolves.toBeUndefined()

    const roots = await sharesQueries.shareRootFiles({ id: actorId, isAdmin: false } as UserModel, {})
    expect(roots.some((root) => root.root.alias === aliases.malformedChild)).toBe(false)
  })
})
