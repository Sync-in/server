/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Inject, Injectable, Logger } from '@nestjs/common'
import { and, count, eq, inArray, isNotNull, isNull, ne, or, SelectedFields, SQL, sql } from 'drizzle-orm'
import { alias, MySqlSelectDynamic, union } from 'drizzle-orm/mysql-core'
import { MySql2PreparedQuery, MySqlQueryResult } from 'drizzle-orm/mysql2'
import { ACTION } from '../../../common/constants'
import { uniquePermissions } from '../../../common/functions'
import { createSlug, popFromObject } from '../../../common/shared'
import { CacheDecorator } from '../../../infrastructure/cache/cache.decorator'
import { Cache } from '../../../infrastructure/cache/services/cache.service'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import type { DBSchema } from '../../../infrastructure/database/interfaces/database.interface'
import {
  concatDistinctObjectsInArray,
  convertToWhere,
  dateTimeUTC,
  dbCheckAffectedRows,
  dbGetInsertedId
} from '../../../infrastructure/database/utils'
import { fileHasCommentsSubquerySQL } from '../../comments/schemas/comments.schema'
import type { FileProps } from '../../files/interfaces/file-props.interface'
import type { FileSpace } from '../../files/interfaces/file-space.interface'
import { filePathSQL, files } from '../../files/schemas/files.schema'
import { links } from '../../links/schemas/links.schema'
import { SpaceEnv } from '../../spaces/models/space-env.model'
import { spacesRoots } from '../../spaces/schemas/spaces-roots.schema'
import { spaceGroupConcatPermissions, spaces } from '../../spaces/schemas/spaces.schema'
import { syncClients } from '../../sync/schemas/sync-clients.schema'
import { syncPaths } from '../../sync/schemas/sync-paths.schema'
import { GROUP_TYPE } from '../../users/constants/group'
import { MEMBER_TYPE } from '../../users/constants/member'
import { USER_ROLE } from '../../users/constants/user'
import type { Owner } from '../../users/interfaces/owner.interface'
import type { UserModel } from '../../users/models/user.model'
import { groups } from '../../users/schemas/groups.schema'
import { usersGroups } from '../../users/schemas/users-groups.schema'
import { userFullNameSQL, users } from '../../users/schemas/users.schema'
import { SHARE_ALL_OPERATIONS, SHARE_TYPE } from '../constants/shares'
import type { ShareMemberDto } from '../dto/create-or-update-share.dto'
import type { ShareChildMember, ShareChildQuery } from '../interfaces/share-child.interface'
import type { ShareEnv } from '../interfaces/share-env.interface'
import type { ShareFile } from '../interfaces/share-file.interface'
import type { ShareLink } from '../interfaces/share-link.interface'
import type { ShareProps } from '../interfaces/share-props.interface'
import { ShareChild } from '../models/share-child.model'
import type { ShareMembers } from '../schemas/share-members.interface'
import type { Share } from '../schemas/share.interface'
import { sharesMembers } from '../schemas/shares-members.schema'
import { shares } from '../schemas/shares.schema'

@Injectable()
export class SharesQueries {
  private readonly logger = new Logger(SharesQueries.name)
  private sharesListQuery: MySql2PreparedQuery<any> = null
  private shareIdsQuery: MySql2PreparedQuery<any> = null
  private shareLinksListQuery: MySql2PreparedQuery<any> = null
  private shareWithMembersQuery: MySql2PreparedQuery<any> = null
  private sharePermissionsQuery: MySql2PreparedQuery<any> = null
  private shareRootFilesQuery: MySql2PreparedQuery<any> = null

  constructor(
    @Inject(DB_TOKEN_PROVIDER) private readonly db: DBSchema,
    public readonly cache: Cache
  ) {}

  async uniqueShareAlias(name: string): Promise<string> {
    let alias = createSlug(name, true)
    let count = 0
    // Personal space name is reserved
    while (await this.shareExistsForAlias(alias)) {
      count += 1
      alias = `${name}-${count}`
    }
    return alias
  }

  shareExistsForOwner(userId: number, shareId: number): any | undefined {
    return this.db.query.shares.findFirst({ columns: { id: true }, where: and(eq(shares.id, shareId), eq(shares.ownerId, userId)) })
  }

  async childExistsForShareOwner(userId: number, shareId: number, childId: number, isAdmin: boolean = false): Promise<number> {
    const childShare: any = alias(shares, 'childShare')
    const withChildren: any = sql`
      WITH RECURSIVE child (id, parentId) AS
                       (SELECT ${shares.id},
                               ${shares.parentId}
                        FROM ${shares}
                        WHERE ${shares.id} = ${shareId}
                          AND (${shares.ownerId} = ${userId} OR (${shares.ownerId} IS NULL AND ${+isAdmin} = 1))
                        UNION
                        SELECT ${childShare.id},
                               ${childShare.parentId}
                        FROM ${shares} AS childShare
                               INNER JOIN child AS cs ON ${childShare.parentId} = cs.id)
      SELECT child.id
      FROM child
      WHERE child.id = ${childId}
      LIMIT 1
    `
    const [r]: { id: number }[][] = (await this.db.execute(withChildren)) as MySqlQueryResult
    return r.length ? r[0].id : null
  }

  async findHighestParentShare(childShareId: number): Promise<number> {
    const parentShare: any = alias(shares, 'parentShare')
    const withParents: any = sql`
      WITH RECURSIVE parent (id, parentId) AS
                       (SELECT ${shares.id},
                               ${shares.parentId}
                        FROM ${shares}
                        WHERE ${shares.id} = ${childShareId}
                        UNION
                        SELECT ${parentShare.id},
                               ${parentShare.parentId}
                        FROM ${shares} AS parentShare
                               INNER JOIN parent AS cs ON ${parentShare.id} = cs.parentId)
      SELECT parent.id
      FROM parent
      WHERE parent.parentId is NULL
      LIMIT 1
    `
    const [r]: { id: number }[][] = (await this.db.execute(withParents)) as MySqlQueryResult
    return r.length ? r[0].id : null
  }

  selectShares(props: Partial<Record<keyof Share, any>>): Promise<Partial<Share>[]> {
    const where: SQL[] = convertToWhere(shares, props)
    return this.db
      .select({ id: shares.id, ownerId: shares.ownerId, alias: shares.alias, name: shares.name })
      .from(shares)
      .where(and(...where))
  }

  selectParentSharesFromSpaceId(spaceId: number, ownerIds?: number[]): Promise<Partial<Share>[]> {
    const where: SQL[] = [eq(shares.spaceId, spaceId), isNull(shares.spaceRootId), isNull(shares.parentId)]
    if (ownerIds && ownerIds.length) {
      where.push(inArray(shares.ownerId, ownerIds))
    }
    return this.db
      .select({ id: shares.id, ownerId: shares.ownerId })
      .from(shares)
      .where(and(...where))
  }

  sharesQuotaExternalPaths(shareId?: number): Promise<Partial<Share>[]> {
    return this.db
      .select({
        id: shares.id,
        alias: shares.alias,
        storageUsage: shares.storageUsage,
        storageQuota: shares.storageQuota,
        externalPath: shares.externalPath
      })
      .from(shares)
      .where(and(isNotNull(shares.externalPath), ...[...(shareId ? [eq(shares.id, shareId)] : [])]))
  }

  async listShareLinks(user: UserModel, shareId: number, asAdmin?: boolean): Promise<ShareLink>

  async listShareLinks(user: UserModel, shareId?: number, asAdmin?: boolean): Promise<ShareLink[]>

  async listShareLinks(user: UserModel, shareId?: number, asAdmin: boolean = false): Promise<ShareLink[] | ShareLink> {
    if (!this.shareLinksListQuery) {
      const [selectFile, shareRootFile, parentShare, parentShareFile, childShareFromRoot, shareMembers] = this.shareFileSelect()
      const linkGuest: any = alias(users, 'linkGuest')
      const select: ShareLink | SelectedFields<any, any> = {
        id: shares.id,
        ownerId: shares.ownerId,
        alias: shares.alias,
        name: shares.name,
        externalPath: sql`IF (${shares.externalPath} IS NOT NULL AND ${shares.ownerId} IS NOT NULL, '.', ${shares.externalPath})`,
        description: shares.description,
        parent: {
          id: parentShare.id,
          ownerId: parentShare.ownerId,
          alias: parentShare.alias,
          name: parentShare.name
        },
        file: selectFile,
        link: {
          id: links.id,
          name: links.name,
          email: links.email,
          uuid: links.uuid,
          requireAuth: links.requireAuth,
          nbAccess: links.nbAccess,
          limitAccess: links.limitAccess,
          permissions: shareMembers.permissions,
          isActive: linkGuest.isActive,
          language: linkGuest.language,
          expiresAt: links.expiresAt,
          createdAt: links.createdAt,
          currentAccess: linkGuest.currentAccess,
          lastAccess: linkGuest.lastAccess,
          currentIp: linkGuest.currentIp,
          lastIp: linkGuest.lastIp
        }
      }
      this.shareLinksListQuery = this.shareFileJoin(select, shareRootFile, parentShare, parentShareFile, childShareFromRoot, shareMembers)
        .innerJoin(links, eq(links.id, shareMembers.linkId))
        .innerJoin(linkGuest, eq(linkGuest.id, links.userId))
        .where(
          and(
            eq(shares.type, SHARE_TYPE.LINK),
            or(eq(sql.placeholder('shareId'), 0), eq(shares.id, sql.placeholder('shareId'))),
            or(
              eq(sql.placeholder('asAdmin'), 1),
              eq(shares.ownerId, sql.placeholder('userId')),
              and(eq(sql.placeholder('isAdmin'), 1), isNull(shares.ownerId))
            )
          )
        )
        .prepare()
    }
    const shareLinks: ShareLink[] = await this.shareLinksListQuery.execute({
      userId: user.id,
      shareId: shareId || 0,
      isAdmin: +user.isAdmin,
      asAdmin: +asAdmin
    })
    if (shareId) {
      return shareLinks.length ? shareLinks[0] : null
    }
    return shareLinks
  }

  async getShareWithMembers(user: UserModel, shareId: number, asAdmin = false): Promise<ShareProps> {
    // asAdmin : true if the user is the owner of the parent share or if the share is requested from the administration
    if (!this.shareWithMembersQuery) {
      const [selectFile, shareRootFile, parentShare, parentShareFile, childShareFromRoot, shareMembers] = this.shareFileSelect()
      const linkUsers: any = alias(users, 'linkUsers')
      const select: ShareProps | SelectedFields<any, any> = {
        id: shares.id,
        ownerId: shares.ownerId,
        name: shares.name,
        alias: shares.alias,
        externalPath: sql`IF (${shares.externalPath} IS NOT NULL AND ${shares.ownerId} IS NOT NULL, '.', ${shares.externalPath})`,
        enabled: shares.enabled,
        description: shares.description,
        storageUsage: shares.storageUsage,
        storageQuota: shares.storageQuota,
        storageIndexing: shares.storageIndexing,
        createdAt: shares.createdAt,
        modifiedAt: shares.modifiedAt,
        disabledAt: shares.disabledAt,
        parent: {
          id: parentShare.id,
          ownerId: parentShare.ownerId,
          alias: parentShare.alias,
          name: parentShare.name
        },
        file: selectFile,
        users: concatDistinctObjectsInArray(users.id, {
          id: users.id,
          login: users.login,
          name: userFullNameSQL(users),
          type: sql`IF (${users.role} = ${USER_ROLE.GUEST}, ${MEMBER_TYPE.GUEST}, ${MEMBER_TYPE.USER})`,
          description: users.email,
          permissions: shareMembers.permissions,
          createdAt: dateTimeUTC(shareMembers.createdAt)
        }),
        groups: concatDistinctObjectsInArray(groups.id, {
          id: groups.id,
          name: groups.name,
          type: sql`IF (${groups.type} = ${GROUP_TYPE.PERSONAL}, ${MEMBER_TYPE.PGROUP}, ${MEMBER_TYPE.GROUP})`,
          description: groups.description,
          permissions: shareMembers.permissions,
          createdAt: dateTimeUTC(shareMembers.createdAt)
        }),
        links: concatDistinctObjectsInArray(linkUsers.id, {
          id: linkUsers.id,
          linkId: links.id,
          login: linkUsers.login,
          name: links.name,
          type: sql.raw(`'${MEMBER_TYPE.USER}'`),
          description: links.email,
          permissions: shareMembers.permissions,
          createdAt: dateTimeUTC(shareMembers.createdAt)
        })
      }
      this.shareWithMembersQuery = this.shareFileJoin(select, shareRootFile, parentShare, parentShareFile, childShareFromRoot, shareMembers)
        .leftJoin(users, and(isNull(shareMembers.linkId), eq(users.id, shareMembers.userId)))
        .leftJoin(groups, eq(groups.id, shareMembers.groupId))
        .leftJoin(linkUsers, and(isNotNull(shareMembers.linkId), eq(linkUsers.id, shareMembers.userId)))
        .leftJoin(links, and(eq(links.userId, linkUsers.id), eq(links.id, shareMembers.linkId)))
        .where(
          and(
            eq(shares.id, sql.placeholder('shareId')),
            or(
              eq(sql.placeholder('asAdmin'), 1),
              eq(shares.ownerId, sql.placeholder('userId')),
              and(eq(sql.placeholder('isAdmin'), 1), isNull(shares.ownerId))
            )
          )
        )
        .groupBy(shares.id)
        .limit(1)
        .prepare()
    }
    const [share] = await this.shareWithMembersQuery.execute({ userId: user.id, shareId, isAdmin: +user.isAdmin, asAdmin: +asAdmin })
    if (!share) return null
    // merge members
    share.members = [...popFromObject('users', share), ...popFromObject('links', share), ...popFromObject('groups', share)]
    return share as ShareProps
  }

  async createShare(share: Partial<Share>): Promise<number> {
    return dbGetInsertedId(await this.db.insert(shares).values(share as Share))
  }

  async updateShare(id: number, set: Partial<Record<keyof Share, any>>): Promise<boolean> {
    try {
      dbCheckAffectedRows(await this.db.update(shares).set(set).where(eq(shares.id, id)).limit(1), 1)
      this.logger.debug(`${this.updateShare.name} - share (${id}) was updated : ${JSON.stringify(set)}`)
      return true
    } catch (e) {
      this.logger.error(`${this.updateShare.name} - share (${id}) was not updated : ${JSON.stringify(set)} : ${e}`)
      return false
    }
  }

  async deleteShare(shareId: number): Promise<boolean> {
    return dbCheckAffectedRows(await this.db.delete(shares).where(eq(shares.id, shareId)), 1)
  }

  async updateMember(set: Partial<Record<keyof ShareMembers, any>>, filters: Partial<Record<keyof ShareMembers, any>>): Promise<boolean> {
    const where: SQL[] = convertToWhere(sharesMembers, filters)
    try {
      dbCheckAffectedRows(
        await this.db
          .update(sharesMembers)
          .set(set)
          .where(and(...where))
          .limit(1),
        1
      )
      this.logger.debug(`${this.updateMember.name} - ${JSON.stringify(filters)} was updated : ${JSON.stringify(set)}`)
      return true
    } catch (e) {
      this.logger.error(`${this.updateMember.name} - ${JSON.stringify(filters)} was not updated : ${JSON.stringify(set)} : ${e}`)
      return false
    }
  }

  async updateMembers(
    shareId: number,
    add: ShareMemberDto[],
    update: Record<string | 'object', Partial<ShareMembers> | ShareMemberDto>[],
    remove: ShareMemberDto[]
  ): Promise<Record<Exclude<ACTION, ACTION.DELETE_PERMANENTLY>, { userIds: number[]; groupIds: number[] }>> {
    // store status
    const status: Record<Exclude<ACTION, ACTION.DELETE_PERMANENTLY>, { userIds: number[]; groupIds: number[] }> = {
      [ACTION.ADD]: { userIds: [], groupIds: [] },
      [ACTION.UPDATE]: { userIds: [], groupIds: [] },
      [ACTION.DELETE]: { userIds: [], groupIds: [] }
    }
    // add
    for (const m of add) {
      try {
        dbCheckAffectedRows(
          await this.db.insert(sharesMembers).values({
            shareId: shareId,
            ...(m.type === MEMBER_TYPE.USER || m.type === MEMBER_TYPE.GUEST ? { userId: m.id } : { groupId: m.id }),
            permissions: m.permissions
          } as ShareMembers),
          1
        )
        status[ACTION.ADD][`${m.type === MEMBER_TYPE.USER || m.type === MEMBER_TYPE.GUEST ? 'userIds' : 'groupIds'}`].push(m.id)
        this.logger.debug(`${this.updateMembers.name} - ${m.type} (${m.id}) added to the share (${shareId})`)
      } catch (e) {
        this.logger.error(`${this.updateMembers.name} - ${m.type} (${m.id}) was not added to the share (${shareId}) ->  : ${e}`)
      }
    }
    // update
    for (const props of update) {
      const m: ShareMemberDto = popFromObject('object', props)
      try {
        dbCheckAffectedRows(
          await this.db
            .update(sharesMembers)
            .set(props)
            .where(
              and(
                eq(sharesMembers.shareId, shareId),
                eq(m.type === MEMBER_TYPE.USER || m.type === MEMBER_TYPE.GUEST ? sharesMembers.userId : sharesMembers.groupId, m.id)
              )
            )
            .limit(1),
          1
        )
        status[ACTION.UPDATE][`${m.type === MEMBER_TYPE.USER || m.type === MEMBER_TYPE.GUEST ? 'userIds' : 'groupIds'}`].push(m.id)
        this.logger.debug(`${this.updateMembers.name} - ${m.type} (${m.id}) was updated on share (${shareId}) : ${JSON.stringify(props)}`)
      } catch (e) {
        this.logger.error(`${this.updateMembers.name} - ${m.type} (${m.id}) was not updated on share (${shareId}) : ${JSON.stringify(props)} : ${e}`)
      }
    }
    // remove
    for (const m of remove) {
      try {
        dbCheckAffectedRows(
          await this.db
            .delete(sharesMembers)
            .where(
              and(
                eq(sharesMembers.shareId, shareId),
                eq(m.type === MEMBER_TYPE.USER || m.type === MEMBER_TYPE.GUEST ? sharesMembers.userId : sharesMembers.groupId, m.id)
              )
            ),
          1
        )
        status[ACTION.DELETE][`${m.type === MEMBER_TYPE.USER || m.type === MEMBER_TYPE.GUEST ? 'userIds' : 'groupIds'}`].push(m.id)
        this.logger.debug(`${this.updateMembers.name} - ${m.type} (${m.id}) removed from share (${shareId})`)
      } catch (e) {
        this.logger.error(`${this.updateMembers.name} - ${m.type} (${m.id}) was not removed from share (${shareId}) : ${e}`)
      }
    }
    return status
  }

  async shareEnv(shareId: number): Promise<Partial<ShareEnv>> {
    const shareSpaceRoot: any = alias(spacesRoots, 'shareSpaceRoot')
    const select: ShareEnv | SelectedFields<any, any> = {
      id: shares.id,
      alias: shares.alias,
      enabled: shares.enabled,
      fileId: shares.fileId,
      spaceId: shares.spaceId,
      spaceRootId: shares.spaceRootId,
      inSharesRepository: sql`${1}`.mapWith(Boolean),
      root: {
        id: files.id,
        owner: { id: users.id, login: users.login },
        file: {
          path: sql`IF (${files.id} IS NOT NULL, ${filePathSQL(files)}, NULL)`,
          inTrash: files.inTrash,
          space: { id: spaces.id, alias: spaces.alias },
          root: {
            id: sql`IF (${spacesRoots.id} IS NULL, ${shareSpaceRoot.id}, ${spacesRoots.id})`,
            externalPath: sql`IF (${spacesRoots.externalPath} IS NULL,
                                  ${shareSpaceRoot.externalPath}, ${spacesRoots.externalPath})`
          }
        },
        externalPath: shares.externalPath
      }
    }
    const [shareEnv] = await this.db
      .select(select)
      .from(shares)
      .leftJoin(shareSpaceRoot, and(isNull(shares.externalPath), isNull(shares.fileId), eq(shareSpaceRoot.id, shares.spaceRootId)))
      .leftJoin(
        files,
        and(
          isNull(shares.externalPath),
          or(and(isNotNull(shares.fileId), eq(files.id, shares.fileId)), and(isNotNull(shareSpaceRoot.fileId), eq(files.id, shareSpaceRoot.fileId)))
        )
      )
      .leftJoin(
        spaces,
        and(
          isNull(shares.externalPath),
          or(
            and(isNotNull(files.spaceId), eq(spaces.id, files.spaceId)),
            and(isNotNull(shareSpaceRoot.spaceId), eq(spaces.id, shareSpaceRoot.spaceId))
          )
        )
      )
      .leftJoin(spacesRoots, and(isNull(shares.externalPath), isNotNull(files.spaceExternalRootId), eq(spacesRoots.id, files.spaceExternalRootId)))
      .leftJoin(users, eq(users.id, files.ownerId))
      .where(eq(shares.id, shareId))
      .execute()
    return shareEnv
  }

  @CacheDecorator()
  async shareIds(userId: number, isAdmin: number): Promise<number[]> {
    if (!this.shareIdsQuery) {
      const unionAlias = union(
        this.fromUserQuery({ id: shares.id }),
        this.fromGroupsQuery({ id: shares.id }),
        this.fromAdminSharesQuery({ id: shares.id })
      ).as('unionAlias')
      this.shareIdsQuery = this.db.select({ id: unionAlias.id }).from(unionAlias).groupBy(unionAlias.id).prepare()
    }
    return (await this.shareIdsQuery.execute({ userId: userId, isAdmin: +isAdmin })).map((r: { id: number }) => r.id)
  }

  async listShares(user: UserModel): Promise<ShareFile[]> {
    if (!this.sharesListQuery) {
      const [selectFile, shareRootFile, parentShare, parentShareFile, childShareFromRoot, shareMembers] = this.shareFileSelect()
      const select: ShareFile | SelectedFields<any, any> = {
        id: shares.id,
        name: shares.name,
        alias: shares.alias,
        externalPath: sql`IF (${shares.externalPath} IS NOT NULL, 1, 0)`.mapWith(Boolean),
        description: shares.description,
        enabled: shares.enabled,
        createdAt: shares.createdAt,
        modifiedAt: shares.modifiedAt,
        parent: {
          id: isNotNull(parentShare.id),
          alias: parentShare.alias,
          name: parentShare.name
        },
        file: selectFile,
        hasComments: fileHasCommentsSubquerySQL(
          sql`IF (${shares.fileId} IS NULL AND ${shareRootFile.id} IS NOT NULL, ${shareRootFile.id}, ${files.id})`
        ),
        counts: {
          users: count(sql`CASE WHEN ${shareMembers.userId} IS NOT NULL AND ${shareMembers.linkId} IS NULL THEN 1 END`),
          groups: count(shareMembers.groupId),
          links: count(shareMembers.linkId)
        }
      }
      this.sharesListQuery = this.shareFileJoin(select, shareRootFile, parentShare, parentShareFile, childShareFromRoot, shareMembers)
        .where(
          and(
            eq(shares.type, sql.placeholder('shareType')),
            or(eq(shares.ownerId, sql.placeholder('userId')), and(eq(sql.placeholder('isAdmin'), 1), isNull(shares.ownerId)))
          )
        )
        .groupBy(shares.id)
        .prepare()
    }
    const r: ShareFile[] = await this.sharesListQuery.execute({ userId: user.id, shareType: SHARE_TYPE.COMMON, isAdmin: +user.isAdmin })
    await this.setShareCounts(r)
    return r
  }

  async listChildShares(userId: number, shareId: number, isAdmin: number): Promise<ShareChild[]> {
    const childShare: any = alias(shares, 'childShare')
    const withChildren: any = sql`
      WITH RECURSIVE child (id, parentId, ownerId, type, name, alias, fileId) AS
                       (SELECT ${shares.id},
                               ${shares.parentId},
                               ${shares.ownerId},
                               ${shares.type},
                               ${shares.name},
                               ${shares.alias},
                               ${shares.fileId}
                        FROM ${shares}
                        WHERE ${shares.id} = ${shareId}
                          AND (${shares.ownerId} = ${userId} OR (${isAdmin} = 1 AND ${shares.ownerId} IS NULL))
                        UNION
                        SELECT ${childShare.id},
                               ${childShare.parentId},
                               ${childShare.ownerId},
                               ${childShare.type},
                               ${childShare.name},
                               ${childShare.alias},
                               ${childShare.fileId}
                        FROM ${shares} AS childShare
                               INNER JOIN child AS cs ON ${childShare.parentId} = cs.id)
      SELECT child.id,
             child.alias,
             child.name,
             child.type,
             child.parentId,
             ${users.login}            AS ownerLogin,
             ${userFullNameSQL(users)} AS ownerFullName,
             ${users.email}            AS ownerEmail,
             ${files.mime}             AS fileMime
      FROM child
             LEFT JOIN ${users} ON child.ownerId = ${users.id}
             LEFT JOIN ${files} ON child.fileId = ${files.id}
      WHERE child.id != ${shareId}
    `
    const [r]: ShareChildQuery[][] = (await this.db.execute(withChildren)) as MySqlQueryResult
    return r.map((s) => new ShareChild(s))
  }

  async listSpaceShares(spaceId: number): Promise<ShareChild[]> {
    const childShare: any = alias(shares, 'childShare')
    const shareSpaceRoot: any = alias(spacesRoots, 'shareSpaceRoot')
    const childShareSpaceRoot: any = alias(spacesRoots, 'childShareSpaceRoot')
    const withChildren: any = sql`
      WITH RECURSIVE child (id, parentId, ownerId, type, name, alias, fileId) AS
                       (SELECT ${shares.id},
                               ${shares.parentId},
                               ${shares.ownerId},
                               ${shares.type},
                               ${shares.name},
                               ${shares.alias},
                               COALESCE(${shares.fileId}, ${shareSpaceRoot.fileId}) AS fileId
                        FROM ${shares}
                               LEFT JOIN ${spacesRoots} AS shareSpaceRoot ON ${shares.spaceRootId} = ${shareSpaceRoot.id}
                        WHERE ${shares.spaceId} = ${spaceId}
                        UNION
                        SELECT ${childShare.id},
                               ${childShare.parentId},
                               ${childShare.ownerId},
                               ${childShare.type},
                               ${childShare.name},
                               ${childShare.alias},
                               COALESCE(${childShare.fileId}, ${childShareSpaceRoot.fileId}) AS fileId
                        FROM ${shares} AS childShare
                               INNER JOIN child AS cs ON ${childShare.parentId} = cs.id
                               LEFT JOIN ${spacesRoots} AS childShareSpaceRoot ON ${childShare.spaceRootId} = ${childShareSpaceRoot.id})
      SELECT child.id,
             child.alias,
             child.name,
             child.type,
             child.parentId,
             ${users.login}            AS ownerLogin,
             ${userFullNameSQL(users)} AS ownerFullName,
             ${users.email}            AS ownerEmail,
             ${files.mime}             AS fileMime
      FROM child
             LEFT JOIN ${users} ON child.ownerId = ${users.id}
             LEFT JOIN ${files} ON child.fileId = ${files.id}
    `
    const [r]: ShareChildQuery[][] = (await this.db.execute(withChildren)) as MySqlQueryResult
    return r.map((s) => new ShareChild(s))
  }

  async membersFromChildSharesPermissions(
    shareId: number,
    userIds: number[] | 'all',
    matchPermRegexp?: string,
    asParent: boolean = true
  ): Promise<ShareChildMember[]> {
    const childShare: any = alias(shares, 'childShare')
    const withChildren: any = sql`
      WITH RECURSIVE children (id, alias, name) AS
                       (SELECT ${shares.id}, ${shares.alias}, ${shares.name}
                        FROM ${shares}
                        WHERE ${asParent ? shares.parentId : shares.id} = ${shareId}
                          AND ${userIds === 'all' ? 1 : inArray(shares.ownerId, userIds)}
                        UNION
                        SELECT ${childShare.id}, ${childShare.alias}, ${childShare.name}
                        FROM ${shares} AS childShare
                               INNER JOIN children AS cs ON ${childShare.parentId} = cs.id)
      SELECT ${sharesMembers.id}          as id,
             ${sharesMembers.userId}      as userId,
             ${sharesMembers.permissions} as userPermissions,
             ${sharesMembers.shareId},
             children.alias               as shareAlias,
             children.name                as shareName
      FROM children
             INNER JOIN ${sharesMembers} ON children.id = ${sharesMembers.shareId}
    `
    if (matchPermRegexp) {
      withChildren.append(sql`WHERE ${sharesMembers.permissions} REGEXP ${matchPermRegexp}`)
    }
    const [r]: ShareChildMember[][] = (await this.db.execute(withChildren)) as MySqlQueryResult
    return r
  }

  async shareRootFiles(user: UserModel, options: { withShares?: boolean; withHasComments?: boolean; withSyncs?: boolean }): Promise<FileProps[]> {
    if (!this.shareRootFilesQuery) {
      const shareSpaceRoot: any = alias(spacesRoots, 'shareSpaceRoot')
      const originOwner: any = alias(users, 'originOwner')
      const childShare: any = alias(shares, 'childShare')
      const selectUnion: FileProps | SelectedFields<any, any> = {
        id: files.id,
        path: sql`IF (${files.id} IS NOT NULL, ${filePathSQL(files)}, '')`.as('path'),
        isDir: files.isDir,
        inTrash: files.inTrash,
        size: files.size,
        ctime: files.ctime,
        mtime: files.mtime,
        mime: files.mime,
        originOwnerId: sql`${originOwner.id}`.as('originOwnerId'),
        originOwnerLogin: sql`${originOwner.login}`.as('originOwnerLogin'),
        originSpaceId: sql`${spaces.id}`.as('originSpaceId'),
        originSpaceAlias: sql`${spaces.alias}`.as('originSpaceAlias'),
        originSpaceExternalRootId: sql`${files.spaceExternalRootId}`.as('originSpaceExternalRootId'),
        originSpaceRootExternalPath: sql`IF (${spacesRoots.externalPath} IS NULL,
                                             ${shareSpaceRoot.externalPath}, ${spacesRoots.externalPath})`.as('originSpaceRootExternalPath'),
        originShareExternalId: sql`IF (${shares.externalPath} IS NOT NULL, ${shares.parentId}, NULL)`.as('originShareExternalId'),
        rootId: sql`${shares.id}`.as('rootId'),
        rootAlias: shares.alias,
        rootName: shares.name,
        rootDescription: shares.description,
        rootEnabled: shares.enabled,
        rootExternalPath: shares.externalPath,
        rootPermissions: sharesMembers.permissions,
        rootOwnerId: sql`${users.id}`.as('rootOwnerId'),
        rootOwnerLogin: sql`${users.login}`.as('rootOwnerLogin'),
        rootOwnerEmail: sql`${users.email}`.as('rootOwnerEmail'),
        rootOwnerFullName: userFullNameSQL(users).as('rootOwnerFullName'),
        childShareId: sql`${childShare.id}`.as('childShareId'),
        childShareAlias: sql`${childShare.alias}`.as('childShareAlias'),
        childShareName: sql`${childShare.name}`.as('childShareName'),
        childShareType: sql`${childShare.type}`.as('childShareType'),
        syncPathId: sql`${syncPaths.id}`.as('syncPathId'),
        syncPathClientId: sql`${syncClients.id}`.as('syncPathClientId'),
        syncPathClientName: sql`JSON_VALUE(${syncClients.info}, '$.node')`.as('syncPathClientName')
      }
      const filters: SQL[] = [or(isNull(shares.ownerId), ne(shares.ownerId, sql.placeholder('userId')))]
      const fromUser = this.fromUserQuery(selectUnion, filters).$dynamic()
      const fromGroups = this.fromGroupsQuery(selectUnion, filters).$dynamic()
      const fromAdminShares = this.fromAdminSharesQuery({ ...selectUnion, rootPermissions: sql.raw(`'${SHARE_ALL_OPERATIONS}'`) }, filters).$dynamic()
      for (const q of [fromUser, fromGroups, fromAdminShares]) {
        q.leftJoin(shareSpaceRoot, and(isNull(shares.externalPath), isNull(shares.fileId), eq(shareSpaceRoot.id, shares.spaceRootId)))
          .leftJoin(
            files,
            or(
              // if the child share is from a share with an external path, the child share should have an external path and a fileId
              and(isNotNull(shares.fileId), eq(files.id, shares.fileId)),
              and(isNull(shares.externalPath), isNull(shares.fileId), isNotNull(shareSpaceRoot.fileId), eq(files.id, shareSpaceRoot.fileId))
            )
          )
          .leftJoin(spaces, and(isNull(shares.externalPath), isNotNull(files.spaceId), eq(spaces.id, files.spaceId)))
          .leftJoin(spacesRoots, and(isNull(shares.externalPath), eq(spacesRoots.id, files.spaceExternalRootId)))
          .leftJoin(
            childShare,
            and(
              eq(sql.placeholder('withShares'), sql.raw('1')),
              eq(childShare.ownerId, sql.placeholder('userId')),
              eq(childShare.parentId, shares.id),
              or(
                and(isNull(childShare.externalPath), isNotNull(childShare.fileId), eq(childShare.fileId, shares.fileId)),
                and(
                  isNull(childShare.externalPath),
                  isNull(childShare.fileId),
                  eq(childShare.spaceId, shares.spaceId),
                  eq(childShare.spaceRootId, shares.spaceRootId)
                ),
                and(isNotNull(childShare.externalPath), isNull(childShare.fileId), eq(shares.externalPath, childShare.externalPath))
              )
            )
          )
          .leftJoin(syncClients, and(eq(sql.placeholder('withSyncs'), sql.raw('1')), eq(syncClients.ownerId, sql.placeholder('userId'))))
          .leftJoin(
            syncPaths,
            and(
              eq(sql.placeholder('withSyncs'), sql.raw('1')),
              eq(syncPaths.clientId, syncClients.id),
              isNull(syncPaths.fileId),
              eq(syncPaths.shareId, shares.id)
            )
          )
          .leftJoin(users, eq(users.id, shares.ownerId))
          .leftJoin(originOwner, and(isNull(shares.externalPath), eq(originOwner.id, files.ownerId)))
      }
      const unionAlias = union(fromUser, fromGroups, fromAdminShares).as('union_alias')
      const select: FileProps | SelectedFields<any, any> = {
        id: unionAlias.id,
        path: unionAlias.path,
        isDir: unionAlias.isDir,
        inTrash: unionAlias.inTrash,
        size: unionAlias.size,
        ctime: unionAlias.ctime,
        mtime: unionAlias.mtime,
        mime: unionAlias.mime,
        origin: {
          ownerId: unionAlias.originOwnerId,
          ownerLogin: unionAlias.originOwnerLogin,
          spaceId: unionAlias.originSpaceId,
          spaceAlias: unionAlias.originSpaceAlias,
          spaceExternalRootId: unionAlias.originSpaceExternalRootId,
          spaceRootExternalPath: unionAlias.originSpaceRootExternalPath,
          shareExternalId: unionAlias.originShareExternalId
        },
        root: {
          id: unionAlias.rootId,
          alias: unionAlias.rootAlias,
          name: unionAlias.rootName,
          description: unionAlias.rootDescription,
          enabled: unionAlias.rootEnabled,
          externalPath: unionAlias.rootExternalPath,
          permissions: spaceGroupConcatPermissions(unionAlias.rootPermissions),
          owner: {
            id: unionAlias.rootOwnerId,
            login: unionAlias.rootOwnerLogin,
            email: unionAlias.rootOwnerEmail,
            fullName: unionAlias.rootOwnerFullName
          } satisfies Owner
        },
        shares: sql`IF (${sql.placeholder('withShares')}, ${concatDistinctObjectsInArray(unionAlias.childShareId, {
          id: unionAlias.childShareId,
          alias: unionAlias.childShareAlias,
          name: unionAlias.childShareName,
          type: unionAlias.childShareType
        })}, '[]')`.mapWith(JSON.parse),
        syncs: sql`IF (${sql.placeholder('withSyncs')}, ${concatDistinctObjectsInArray(unionAlias.syncPathId, {
          id: unionAlias.syncPathId,
          clientId: unionAlias.syncPathClientId,
          clientName: unionAlias.syncPathClientName
        })}, '[]')`.mapWith(JSON.parse),
        hasComments: sql<boolean>`IF (${sql.placeholder('withHasComments')}, ${fileHasCommentsSubquerySQL(unionAlias.id)}, 0)`.mapWith(Boolean)
      }
      this.shareRootFilesQuery = this.db.select(select).from(unionAlias).groupBy(unionAlias.rootId).prepare()
    }
    const fps: FileProps[] = await this.shareRootFilesQuery.execute({
      userId: user.id,
      isAdmin: +user.isAdmin,
      withHasComments: +!!options.withHasComments,
      withShares: +!!options.withShares,
      withSyncs: +!!options.withSyncs
    })
    for (const f of fps) {
      f.root.permissions = uniquePermissions(f.root.permissions)
    }
    return fps
  }

  @CacheDecorator()
  async permissions(userId: number, shareAlias: string, isAdmin: number = 0): Promise<Partial<SpaceEnv>> {
    if (!this.sharePermissionsQuery) {
      const shareSpaceRoot: any = alias(spacesRoots, 'shareSpaceRoot')
      const selectUnion: SpaceEnv | SelectedFields<any, any> = {
        id: shares.id,
        alias: shares.alias,
        name: shares.name,
        enabled: shares.enabled,
        permissions: sharesMembers.permissions,
        rootId: sql`${files.id}`.as('rootId'),
        rootOwnerId: sql`${users.id}`.as('rootOwnerId'),
        rootOwnerLogin: users.login,
        rootSpaceId: sql`${spaces.id}`.as('rootSpaceId'),
        rootSpaceAlias: sql`${spaces.alias}`.as('rootSpaceAlias'),
        rootPath: sql`IF (${files.id} IS NOT NULL, ${filePathSQL(files)}, NULL)`.as('rootPath'),
        rootInTrash: files.inTrash,
        rootExternalPath: shares.externalPath,
        rootExternalParentShareId: sql`IF (${shares.externalPath} IS NOT NULL, ${shares.parentId}, NULL)`.as('rootExternalParentShareId'),
        rootSpaceRootId: sql`IF (${spacesRoots.id} IS NULL, ${shareSpaceRoot.id}, ${spacesRoots.id})`.as('rootSpaceRootId'),
        rootSpaceRootExternalPath: sql`IF (${spacesRoots.externalPath} IS NULL,
                                           ${shareSpaceRoot.externalPath}, ${spacesRoots.externalPath})`.as('rootSpaceRootExternalPath')
      }
      const filters: SQL[] = [eq(shares.alias, sql.placeholder('shareAlias'))]
      const fromUser = this.fromUserQuery(selectUnion, filters).$dynamic()
      const fromGroups = this.fromGroupsQuery(selectUnion, filters).$dynamic()
      const fromAdminShares = this.fromAdminSharesQuery({ ...selectUnion, permissions: sql.raw(`'${SHARE_ALL_OPERATIONS}'`) }, filters).$dynamic()
      for (const q of [fromUser, fromGroups, fromAdminShares]) {
        q.leftJoin(shareSpaceRoot, and(isNull(shares.externalPath), isNull(shares.fileId), eq(shareSpaceRoot.id, shares.spaceRootId)))
          .leftJoin(
            files,
            or(
              // in case of share child from a share with external path, child share should have an external path and a fileId
              and(isNotNull(shares.fileId), eq(files.id, shares.fileId)),
              and(isNull(shares.externalPath), isNotNull(shareSpaceRoot.fileId), eq(files.id, shareSpaceRoot.fileId))
            )
          )
          .leftJoin(
            spaces,
            and(
              isNull(shares.externalPath),
              or(
                and(isNotNull(files.spaceId), eq(spaces.id, files.spaceId)),
                and(isNotNull(shareSpaceRoot.spaceId), eq(spaces.id, shareSpaceRoot.spaceId))
              )
            )
          )
          .leftJoin(spacesRoots, and(isNull(shares.externalPath), eq(spacesRoots.id, files.spaceExternalRootId)))
          .leftJoin(users, eq(users.id, files.ownerId))
      }
      const unionAlias = union(fromUser, fromGroups, fromAdminShares).as('union_alias')
      const select: SpaceEnv | SelectedFields<any, any> = {
        id: unionAlias.id,
        alias: unionAlias.alias,
        name: unionAlias.name,
        enabled: unionAlias.enabled,
        permissions: spaceGroupConcatPermissions(unionAlias.permissions),
        root: {
          id: unionAlias.rootId,
          owner: { id: unionAlias.rootOwnerId, login: unionAlias.rootOwnerLogin },
          file: {
            path: unionAlias.rootPath,
            inTrash: unionAlias.rootInTrash,
            space: { id: unionAlias.rootSpaceId, alias: unionAlias.rootSpaceAlias },
            root: { id: unionAlias.rootSpaceRootId, externalPath: unionAlias.rootSpaceRootExternalPath }
          },
          externalPath: unionAlias.rootExternalPath,
          externalParentShareId: unionAlias.rootExternalParentShareId
        }
      }
      this.sharePermissionsQuery = this.db.select(select).from(unionAlias).groupBy(unionAlias.id).limit(1).prepare()
    }
    // `userId` is used in `fromUserQuery` and `fromGroupsQuery` function
    // `isAdmin` is used in `fromAdminSharesQuery` function
    const [r]: Partial<SpaceEnv>[] = await this.sharePermissionsQuery.execute({ userId, shareAlias, isAdmin })
    if (r) {
      r.permissions = uniquePermissions(r.permissions)
    }
    return r
  }

  @CacheDecorator(900, true)
  async childSharesCount(shareId: number): Promise<number> {
    const childShare: any = alias(shares, 'childShare')
    const withChildren: any = sql`
      WITH RECURSIVE children (id, parentId) AS
                       (SELECT ${shares.id}, ${shares.parentId}
                        FROM ${shares}
                        WHERE ${shares.parentId} IS NOT NULL
                          AND ${shares.parentId} = ${shareId}
                        UNION
                        SELECT ${childShare.id}, cs.parentId
                        FROM ${shares} AS childShare
                               INNER JOIN children AS cs ON ${childShare.parentId} = cs.id)
      SELECT COUNT(children.id) as count
      FROM children
      GROUP BY parentId
    `
    const [r]: { count: number }[][] = (await this.db.execute(withChildren)) as MySqlQueryResult
    return r.length ? r[0].count : 0
  }

  async clearCachePermissions(shareAlias: string, userIds: number[]) {
    // `permissions` argument must match with `this.permissions.name` function
    for (const userId of userIds) {
      const pattern = this.cache.genSlugKey(this.constructor.name, this.permissions.name, userId, shareAlias, '*')
      const keys = await this.cache.keys(pattern)
      if (keys.length) {
        this.logger.verbose(`${this.clearCachePermissions.name} - ${JSON.stringify(keys)}`)
        this.cache.mdel(keys).catch((e: Error) => this.logger.error(`${this.clearCachePermissions.name} - ${e}`))
      }
    }
  }

  private shareExistsForAlias(alias: string): any | undefined {
    return this.db.query.shares.findFirst({ columns: { id: true }, where: eq(shares.alias, alias) })
  }

  private fromUserQuery(select: SelectedFields<any, any>, filters: SQL[] = []) {
    const where: SQL[] = [eq(sharesMembers.userId, sql.placeholder('userId')), ...filters]
    return this.db
      .select(select)
      .from(sharesMembers)
      .innerJoin(shares, eq(sharesMembers.shareId, shares.id))
      .where(and(...where))
  }

  private fromGroupsQuery(select: SelectedFields<any, any>, filters: SQL[] = []) {
    const where: SQL[] = [eq(sharesMembers.groupId, usersGroups.groupId), ...filters]
    return this.db
      .select(select)
      .from(sharesMembers)
      .innerJoin(usersGroups, eq(usersGroups.userId, sql.placeholder('userId')))
      .innerJoin(shares, eq(sharesMembers.shareId, shares.id))
      .where(and(...where))
  }

  private fromAdminSharesQuery(select: SelectedFields<any, any>, filters: SQL[] = []) {
    const where: SQL[] = [eq(sql.placeholder('isAdmin'), sql.raw('1')), isNull(shares.ownerId), ...filters]
    return this.db
      .select(select)
      .from(shares)
      .where(and(...where))
  }

  private shareFileSelect(): any[] {
    const shareRootFile: any = alias(files, 'shareRootFile')
    const parentShare: any = alias(shares, 'parentShare')
    const parentShareFile: any = alias(files, 'parentShareFile')
    const childShareFromRoot: any = alias(spacesRoots, 'childShareFromRoot')
    const shareMembers: any = alias(sharesMembers, 'shareMembers')
    const selectFile: FileSpace | SelectedFields<any, any> = {
      id: sql`IF (${shares.fileId} IS NULL AND ${shareRootFile.id} IS NOT NULL,
                  ${shareRootFile.id}, ${files.id})`.as('fileId'),
      ownerId: sql`IF (${shares.spaceId} IS NOT NULL,
                       NULL, ${files.ownerId})`.as('fileOwnerId'),
      name: sql`IF (${shares.fileId} IS NULL AND ${spacesRoots.id} IS NOT NULL,
                    ${spacesRoots.name},
                    IF(${childShareFromRoot.id} IS NOT NULL
                           OR ${shares.fileId} = ${parentShare.fileId}, ${parentShare.name}, ${files.name}))`.as('fileName'),
      path: sql`IF (${shareRootFile.id} IS NOT NULL AND ${shares.fileId} IS NOT NULL,
                    REGEXP_REPLACE(${filePathSQL(files)}, CONCAT(${filePathSQL(shareRootFile)}, '/'), ''),
                    IF(${parentShareFile.id} IS NOT NULL AND ${shares.fileId} IS NOT NULL,
                       IF(${parentShareFile.id} = ${shares.fileId}, '.',
                          REGEXP_REPLACE(${filePathSQL(files)}, CONCAT(${filePathSQL(parentShareFile)}, '/'), '')),
                       IF(${shares.fileId} IS NOT NULL, ${filePathSQL(files)}, '.')))`.as('filePath'),
      isDir: sql`IF (${shares.fileId} IS NULL AND ${shares.spaceRootId} IS NOT NULL,
                     ${shareRootFile.isDir}, ${files.isDir})`.as('fileIsDir'),
      inTrash: sql`IF (${shares.fileId} IS NULL AND ${shares.spaceRootId} IS NOT NULL,
                       ${shareRootFile.inTrash}, ${files.inTrash})`.as('fileInTrash'),
      mime: sql`IF (${shares.fileId} IS NULL AND ${shares.spaceRootId} IS NOT NULL,
                    ${shareRootFile.mime}, ${files.mime})`.as('fileMime'),
      space: {
        alias: spaces.alias,
        name: spaces.name,
        root: {
          alias: sql`IF (${shares.parentId} IS NULL, ${spacesRoots.alias}, NULL)`,
          name: sql`IF (${shares.parentId} IS NULL, ${spacesRoots.name}, NULL)`
        }
      }
    }
    return [selectFile, shareRootFile, parentShare, parentShareFile, childShareFromRoot, shareMembers]
  }

  private shareFileJoin(
    select: any,
    shareRootFile: any,
    parentShare: any,
    parentShareFile: any,
    childShareFromRoot: any,
    shareMembers: any
  ): MySqlSelectDynamic<any> {
    return this.db
      .select(select)
      .from(shares)
      .leftJoin(files, and(isNotNull(shares.fileId), eq(files.id, shares.fileId)))
      .leftJoin(spaces, and(isNull(shares.externalPath), isNull(shares.parentId), isNotNull(shares.spaceId), eq(spaces.id, shares.spaceId)))
      .leftJoin(
        spacesRoots,
        and(isNull(shares.externalPath), isNull(shares.parentId), isNotNull(shares.spaceRootId), eq(spacesRoots.id, shares.spaceRootId))
      )
      .leftJoin(
        childShareFromRoot,
        and(
          isNull(shares.externalPath),
          isNotNull(shares.parentId),
          isNull(shares.fileId),
          isNotNull(shares.spaceRootId),
          eq(childShareFromRoot.id, shares.spaceRootId)
        )
      )
      .leftJoin(
        shareRootFile,
        and(
          isNull(shares.externalPath),
          isNotNull(shares.spaceRootId),
          or(
            and(isNull(shares.parentId), eq(shareRootFile.id, spacesRoots.fileId)),
            and(isNotNull(shares.parentId), eq(shareRootFile.id, childShareFromRoot.fileId))
          )
        )
      )
      .leftJoin(parentShare, and(isNotNull(shares.parentId), eq(parentShare.id, shares.parentId)))
      .leftJoin(parentShareFile, and(isNotNull(shares.parentId), isNotNull(parentShare.fileId), eq(parentShareFile.id, parentShare.fileId)))
      .leftJoin(shareMembers, eq(shareMembers.shareId, shares.id))
      .$dynamic()
  }

  private async setShareCounts(shares: ShareFile[]) {
    if (!shares.length) return
    for (const share of shares) {
      share.counts.shares = await this.childSharesCount(share.id)
    }
  }
}
