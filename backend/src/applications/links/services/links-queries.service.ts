/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Inject, Injectable } from '@nestjs/common'
import { and, eq, getTableColumns, isNotNull, isNull, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/mysql-core'
import { Cache } from '../../../infrastructure/cache/services/cache.service'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import type { DBSchema } from '../../../infrastructure/database/interfaces/database.interface'
import { dbGetInsertedId } from '../../../infrastructure/database/utils'
import { files } from '../../files/schemas/files.schema'
import type { ShareMembers } from '../../shares/schemas/share-members.interface'
import type { Share } from '../../shares/schemas/share.interface'
import { sharesMembers } from '../../shares/schemas/shares-members.schema'
import { shares } from '../../shares/schemas/shares.schema'
import { SPACE_ROLE } from '../../spaces/constants/spaces'
import type { SpaceMembers } from '../../spaces/schemas/space-members.interface'
import { spacesMembers } from '../../spaces/schemas/spaces-members.schema'
import { spacesRoots } from '../../spaces/schemas/spaces-roots.schema'
import { spaces } from '../../spaces/schemas/spaces.schema'
import { USER_ROLE } from '../../users/constants/user'
import type { User } from '../../users/schemas/user.interface'
import { userFullNameSQL, users } from '../../users/schemas/users.schema'
import { CACHE_LINK_UUID_PREFIX, CACHE_LINK_UUID_TTL } from '../constants/cache'
import { LINK_TYPE } from '../constants/links'
import type { LinkAsUser, LinkGuest } from '../interfaces/link-guest.interface'
import type { SpaceLink } from '../interfaces/link-space.interface'
import type { Link } from '../schemas/link.interface'
import { links } from '../schemas/links.schema'

@Injectable()
export class LinksQueries {
  constructor(
    @Inject(DB_TOKEN_PROVIDER) private readonly db: DBSchema,
    private readonly cache: Cache
  ) {}

  async linkFromShare(ownerId: number, linkId: number, shareId: number, isAdmin: number = 0): Promise<LinkGuest> {
    const [r] = await this.db
      .select({
        ...getTableColumns(links),
        permissions: sharesMembers.permissions,
        language: users.language,
        isActive: users.isActive
      })
      .from(links)
      .innerJoin(shares, and(eq(shares.id, shareId), or(eq(shares.ownerId, ownerId), and(eq(sql`${isAdmin}`, 1), isNull(shares.ownerId)))))
      .innerJoin(sharesMembers, and(eq(sharesMembers.shareId, shares.id), eq(sharesMembers.userId, links.userId), eq(sharesMembers.linkId, linkId)))
      .innerJoin(users, eq(users.id, links.userId))
      .where(eq(links.id, linkId))
      .limit(1)
    return r as LinkGuest
  }

  async linkFromSpace(managerId: number, linkId: number, spaceId: number): Promise<LinkGuest> {
    const linkMember: any = alias(spacesMembers, 'linkMember')
    const [r] = await this.db
      .select({
        ...getTableColumns(links),
        permissions: linkMember.permissions,
        language: users.language,
        isActive: users.isActive
      })
      .from(links)
      .innerJoin(
        spacesMembers,
        and(eq(spacesMembers.spaceId, spaceId), eq(spacesMembers.userId, managerId), eq(spacesMembers.role, SPACE_ROLE.IS_MANAGER))
      )
      .innerJoin(linkMember, and(eq(linkMember.spaceId, spacesMembers.spaceId), eq(linkMember.userId, links.userId), eq(linkMember.linkId, linkId)))
      .innerJoin(users, eq(users.id, links.userId))
      .where(eq(links.id, linkId))
      .limit(1)
    return r as LinkGuest
  }

  async updateLinkFromSpaceOrShare(
    link: LinkGuest,
    shareId: number,
    diffUser: Partial<User>,
    diffLink: Partial<Link>,
    diffShare: Partial<Share>,
    diffMember: Partial<ShareMembers>
  ) {
    if (Object.keys(diffUser).length) {
      await this.db.update(users).set(diffUser).where(eq(users.id, link.userId))
    }
    if (Object.keys(diffLink).length) {
      await this.db.update(links).set(diffLink).where(eq(links.id, link.id))
    }
    if (Object.keys(diffShare).length) {
      await this.db.update(shares).set(diffShare).where(eq(shares.id, shareId))
    }
    if (Object.keys(diffMember).length) {
      await this.db
        .update(sharesMembers)
        .set(diffMember)
        .where(and(eq(sharesMembers.shareId, shareId), eq(sharesMembers.userId, link.userId), eq(sharesMembers.linkId, link.id)))
    }
  }

  async createLinkToSpaceOrShare(guestId: number, spaceOrShareId: number, type: LINK_TYPE, link: Partial<LinkGuest>): Promise<number> {
    const linkId = dbGetInsertedId(await this.db.insert(links).values(link as Link))
    if (type === LINK_TYPE.SPACE) {
      await this.db.insert(spacesMembers).values({
        userId: guestId,
        spaceId: spaceOrShareId,
        permissions: link.permissions,
        role: SPACE_ROLE.IS_MEMBER,
        linkId: linkId
      } as SpaceMembers)
    } else {
      await this.db.insert(sharesMembers).values({
        userId: guestId,
        shareId: spaceOrShareId,
        linkId: linkId,
        permissions: link.permissions
      } as ShareMembers)
    }
    return linkId
  }

  allLinksFromSpaceOrShare(spaceOrShareId: number, type: LINK_TYPE): Promise<{ id: number; linkId: number }[]> {
    const members: any = alias(type == 'share' ? sharesMembers : spacesMembers, 'members')
    return this.db
      .select({ id: users.id, linkId: members.linkId })
      .from(members)
      .innerJoin(users, and(eq(users.id, members.userId), eq(users.role, USER_ROLE.LINK)))
      .where(and(eq(type == 'share' ? members.shareId : members.spaceId, spaceOrShareId), isNotNull(members.linkId)))
  }

  async linkFromUUID(uuid: string): Promise<LinkAsUser> {
    const { password, ...userColumns } = getTableColumns(users)
    const [r] = await this.db
      .select({
        ...getTableColumns(links),
        user: { ...userColumns }
      })
      .from(links)
      .leftJoin(users, eq(users.id, links.userId))
      .where(eq(links.uuid, uuid))
      .limit(1)
    return r
  }

  async spaceLink(uuid: string): Promise<SpaceLink> {
    const shareOwner: any = alias(users, 'shareOwner')
    const shareSpaceRoot: any = alias(spacesRoots, 'shareSpaceRoot')
    const [r]: SpaceLink[] = await this.db
      .select({
        share: {
          name: shares.name,
          alias: shares.alias,
          hasParent: isNotNull(shares.parentId).mapWith(Boolean),
          isDir: sql`IF (${isNotNull(shares.externalPath)}, 1 ,${files.isDir})`.mapWith(Boolean),
          mime: files.mime
        },
        space: { name: spaces.name, alias: spaces.alias },
        owner: { login: shareOwner.login, fullName: userFullNameSQL(shareOwner) }
      })
      .from(links)
      .leftJoin(sharesMembers, eq(sharesMembers.linkId, links.id))
      .leftJoin(shares, eq(shares.id, sharesMembers.shareId))
      .leftJoin(shareOwner, eq(shareOwner.id, shares.ownerId))
      .leftJoin(spacesMembers, eq(spacesMembers.linkId, links.id))
      .leftJoin(spaces, eq(spaces.id, spacesMembers.spaceId))
      .leftJoin(shareSpaceRoot, and(isNull(shares.externalPath), isNull(shares.fileId), eq(shareSpaceRoot.id, shares.spaceRootId)))
      .leftJoin(
        files,
        or(
          and(isNotNull(shares.fileId), eq(files.id, shares.fileId)),
          and(isNull(shares.externalPath), isNotNull(shareSpaceRoot.fileId), eq(files.id, shareSpaceRoot.fileId))
        )
      )
      .where(eq(links.uuid, uuid))
      .limit(1)
    return r
  }

  async incrementLinkNbAccess(uuid: string) {
    await this.db
      .update(links)
      .set({ nbAccess: sql`${links.nbAccess} + 1` } as Record<keyof Link, any>)
      .where(eq(links.uuid, uuid))
      .limit(1)
  }

  async isUniqueUUID(userId: number, uuid: string) {
    const [r] = await this.db.select({ check: links.uuid }).from(links).where(eq(links.uuid, uuid)).limit(1)
    if (!r) {
      // uuid does not exist in db
      const cacheKey = this.cache.genSlugKey(CACHE_LINK_UUID_PREFIX, userId, uuid)
      // check if uuid was already requested
      if (!(await this.cache.has(cacheKey))) {
        // store uuid to prevent reuse
        await this.cache.set(cacheKey, uuid, CACHE_LINK_UUID_TTL)
        return true
      }
      return false
    }
    return false
  }

  isReservedUUID(userId: number, uuid: string): Promise<boolean> {
    // check if uuid is reserved
    return this.cache.has(this.cache.genSlugKey(CACHE_LINK_UUID_PREFIX, userId, uuid))
  }
}
