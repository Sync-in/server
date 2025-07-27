/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Inject, Injectable, Logger } from '@nestjs/common'
import { and, countDistinct, eq, isNotNull, isNull, max, SelectedFields, SQL, sql } from 'drizzle-orm'
import { alias, union } from 'drizzle-orm/mysql-core'
import { MySql2PreparedQuery, MySqlQueryResult } from 'drizzle-orm/mysql2'
import { ACTION } from '../../../common/constants'
import { popFromObject } from '../../../common/shared'
import { CacheDecorator } from '../../../infrastructure/cache/cache.decorator'
import { Cache } from '../../../infrastructure/cache/services/cache.service'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import { DBSchema } from '../../../infrastructure/database/interfaces/database.interface'
import {
  concatDistinctObjectsInArray,
  convertToSelect,
  convertToWhere,
  dateTimeUTC,
  dbCheckAffectedRows,
  dbGetInsertedId
} from '../../../infrastructure/database/utils'
import { fileHasCommentsSubquerySQL } from '../../comments/schemas/comments.schema'
import { FileDBProps } from '../../files/interfaces/file-db-props.interface'
import { FileProps } from '../../files/interfaces/file-props.interface'
import { filePathSQL, files } from '../../files/schemas/files.schema'
import { FilesQueries } from '../../files/services/files-queries.service'
import { links } from '../../links/schemas/links.schema'
import { shares } from '../../shares/schemas/shares.schema'
import { SharesQueries } from '../../shares/services/shares-queries.service'
import { syncClients } from '../../sync/schemas/sync-clients.schema'
import { syncPaths } from '../../sync/schemas/sync-paths.schema'
import { GROUP_TYPE } from '../../users/constants/group'
import { MEMBER_TYPE } from '../../users/constants/member'
import { USER_ROLE } from '../../users/constants/user'
import { Member } from '../../users/interfaces/member.interface'
import { groups } from '../../users/schemas/groups.schema'
import { usersGroups } from '../../users/schemas/users-groups.schema'
import { userFullNameSQL, users } from '../../users/schemas/users.schema'
import { SPACE_ROLE } from '../constants/spaces'
import { SpaceMemberDto } from '../dto/create-or-update-space.dto'
import { SpaceEnv } from '../models/space-env.model'
import { SpaceProps } from '../models/space-props.model'
import { SpaceRootProps } from '../models/space-root-props.model'
import { SpaceMembers } from '../schemas/space-members.interface'
import { SpaceRoot } from '../schemas/space-root.interface'
import { Space } from '../schemas/space.interface'
import { spacesMembers } from '../schemas/spaces-members.schema'
import { spacesRoots } from '../schemas/spaces-roots.schema'
import { spaceGroupConcatPermissions, spaces } from '../schemas/spaces.schema'

@Injectable()
export class SpacesQueries {
  private readonly logger = new Logger(SpacesQueries.name)
  private spacePermissionsQuery: MySql2PreparedQuery<any> = null
  private spaceAndRootPermissionsQuery: MySql2PreparedQuery<any> = null
  private spacesWithDetailsQuery: MySql2PreparedQuery<any> = null
  private spacesQuery: MySql2PreparedQuery<any> = null
  private spaceIdsQuery: MySql2PreparedQuery<any> = null
  private spaceQuery: MySql2PreparedQuery<any> = null
  private spacesWithPermissionsQuery: MySql2PreparedQuery<any> = null
  private spaceFromIdWithPermissionsQuery: MySql2PreparedQuery<any> = null
  private spaceRootFilesQuery: MySql2PreparedQuery<any> = null

  constructor(
    @Inject(DB_TOKEN_PROVIDER) private readonly db: DBSchema,
    private readonly cache: Cache,
    private readonly filesQueries: FilesQueries,
    private readonly sharesQueries: SharesQueries
  ) {}

  spaceExistsForAlias(alias: string): any | undefined {
    return this.db.query.spaces.findFirst({ columns: { id: true }, where: eq(spaces.alias, alias) })
  }

  spaceRootExistsForAlias(spaceId: number, rootAlias: string): any | undefined {
    return this.db.query.spacesRoots.findFirst({
      columns: { id: true },
      where: and(eq(spacesRoots.spaceId, spaceId), eq(spacesRoots.alias, rootAlias))
    })
  }

  selectSpaces(fields: Partial<keyof Space>[] = ['id', 'alias', 'name'], where: SQL[]): Promise<Partial<Space>[]> {
    const select: Record<keyof Space, any> = convertToSelect(spaces, fields)
    return this.db
      .select(select)
      .from(spaces)
      .where(and(...where))
  }

  async userIsSpaceManager(userId: number, spaceId: number, shareId?: number): Promise<boolean> {
    /* Check if user is a space manager */
    const q = this.db
      .select({
        userId: spacesMembers.userId,
        spaceId: spacesMembers.spaceId,
        ...(shareId && { shareId: shares.id })
      })
      .from(spacesMembers)
    if (shareId) {
      q.innerJoin(shares, and(eq(shares.id, shareId), eq(shares.spaceId, spaceId)))
    }
    const [r] = await q
      .where(and(eq(spacesMembers.spaceId, spaceId), eq(spacesMembers.userId, userId), eq(spacesMembers.role, SPACE_ROLE.IS_MANAGER)))
      .limit(1)
    return r && r.userId === userId && r.spaceId === spaceId && (shareId ? r.shareId === shareId : true)
  }

  async getSpaceAsManager(userId: number, spaceId: number): Promise<SpaceProps> {
    /* User must be the manager of the space */
    // todo: make a condition if current user is an admin
    if (!this.spaceQuery) {
      const otherMembers: any = alias(spacesMembers, 'otherMembers')
      const rootOwner: any = alias(users, 'rootOwner')
      // fileOwner: avoid providing file path information for roots not owned by the current user
      const fileOwner: any = alias(files, 'fileOwner')
      const linkUsers: any = alias(users, 'linkUsers')
      this.spaceQuery = this.db
        .select({
          id: spaces.id,
          name: spaces.name,
          alias: spaces.alias,
          description: spaces.description,
          enabled: spaces.enabled,
          storageUsage: spaces.storageUsage,
          storageQuota: spaces.storageQuota,
          createdAt: spaces.createdAt,
          modifiedAt: spaces.modifiedAt,
          disabledAt: spaces.disabledAt,
          roots: concatDistinctObjectsInArray(spacesRoots.id, {
            id: spacesRoots.id,
            name: spacesRoots.name,
            alias: spacesRoots.alias,
            externalPath: spacesRoots.externalPath,
            permissions: spacesRoots.permissions,
            createdAt: dateTimeUTC(spacesRoots.createdAt),
            owner: { id: rootOwner.id, login: rootOwner.login, fullName: userFullNameSQL(rootOwner), email: rootOwner.email },
            // fileOwner: (hide if not owner), files: allow fields
            file: { id: fileOwner.id, path: filePathSQL(fileOwner), mime: files.mime }
          }),
          users: concatDistinctObjectsInArray(users.id, {
            id: users.id,
            login: users.login,
            name: userFullNameSQL(users),
            type: sql`IF (${users.role} = ${USER_ROLE.GUEST}, ${MEMBER_TYPE.GUEST}, ${MEMBER_TYPE.USER})`,
            spaceRole: otherMembers.role,
            description: users.email,
            permissions: otherMembers.permissions,
            createdAt: dateTimeUTC(otherMembers.createdAt)
          }),
          groups: concatDistinctObjectsInArray(groups.id, {
            id: groups.id,
            name: groups.name,
            type: sql`IF (${groups.type} = ${GROUP_TYPE.PERSONAL}, ${MEMBER_TYPE.PGROUP}, ${MEMBER_TYPE.GROUP})`,
            spaceRole: sql`${SPACE_ROLE.IS_MEMBER}`,
            description: groups.description,
            permissions: otherMembers.permissions,
            createdAt: dateTimeUTC(otherMembers.createdAt)
          }),
          links: concatDistinctObjectsInArray(linkUsers.id, {
            id: linkUsers.id,
            linkId: links.id,
            name: links.name,
            type: sql.raw(`'${MEMBER_TYPE.USER}'`),
            spaceRole: sql`${SPACE_ROLE.IS_MEMBER}`,
            description: links.email,
            permissions: otherMembers.permissions,
            createdAt: dateTimeUTC(otherMembers.createdAt)
          })
        })
        .from(spacesMembers)
        .innerJoin(
          spaces,
          and(
            eq(spaces.id, spacesMembers.spaceId),
            eq(spacesMembers.spaceId, sql.placeholder('spaceId')),
            eq(spacesMembers.userId, sql.placeholder('userId')),
            eq(spacesMembers.role, SPACE_ROLE.IS_MANAGER)
          )
        )
        .innerJoin(otherMembers, eq(otherMembers.spaceId, spaces.id))
        .leftJoin(users, and(isNull(otherMembers.linkId), eq(otherMembers.userId, users.id)))
        .leftJoin(linkUsers, and(isNotNull(otherMembers.linkId), eq(linkUsers.id, otherMembers.userId)))
        .leftJoin(links, and(eq(links.userId, linkUsers.id), eq(links.id, otherMembers.linkId)))
        .leftJoin(groups, eq(otherMembers.groupId, groups.id))
        .leftJoin(spacesRoots, eq(spacesRoots.spaceId, spaces.id))
        .leftJoin(files, eq(spacesRoots.fileId, files.id))
        .leftJoin(rootOwner, eq(rootOwner.id, files.ownerId))
        .leftJoin(fileOwner, and(eq(fileOwner.id, files.id), eq(fileOwner.ownerId, sql.placeholder('userId'))))
        .groupBy(spaces.id)
        .limit(1)
        .prepare()
    }
    const [space] = await this.spaceQuery.execute({ userId, spaceId })
    if (!space) {
      return null
    }
    // merge members
    space.members = [...popFromObject('users', space), ...popFromObject('groups', space), ...popFromObject('links', space)]
    return new SpaceProps(space, userId)
  }

  async createSpace(space: SpaceProps): Promise<number> {
    return dbGetInsertedId(await this.db.insert(spaces).values(space))
  }

  async deleteSpace(spaceId: number, deleteNow = false): Promise<boolean> {
    let r: MySqlQueryResult
    if (deleteNow) {
      r = await this.db.delete(spaces).where(eq(spaces.id, spaceId))
    } else {
      r = await this.db
        .update(spaces)
        .set({ enabled: false, disabledAt: new Date() } as Space)
        .where(eq(spaces.id, spaceId))
    }
    return dbCheckAffectedRows(r, 1)
  }

  async updateSpace(id: number, set: Partial<Record<keyof Space, any>>): Promise<boolean> {
    try {
      dbCheckAffectedRows(await this.db.update(spaces).set(set).where(eq(spaces.id, id)), 1)
      this.logger.debug(`${this.updateSpace.name} - space (${id}) was updated : ${JSON.stringify(set)}`)
      return true
    } catch (e) {
      this.logger.error(`${this.updateSpace.name} - space (${id}) was not updated : ${JSON.stringify(set)} : ${e}`)
      return false
    }
  }

  async spaceRootFiles(
    userId: number,
    spaceId: number,
    options: {
      withShares?: boolean
      withHasComments?: boolean
      withSyncs?: boolean
    }
  ): Promise<FileProps[]> {
    if (!this.spaceRootFilesQuery) {
      const select: FileProps | SelectedFields<any, any> = {
        id: files.id,
        path: filePathSQL(files),
        isDir: files.isDir,
        inTrash: files.inTrash,
        size: files.size,
        ctime: files.ctime,
        mtime: files.mtime,
        mime: files.mime,
        root: {
          id: spacesRoots.id,
          alias: spacesRoots.alias,
          name: spacesRoots.name,
          externalPath: spacesRoots.externalPath,
          permissions: spacesRoots.permissions,
          owner: { login: users.login, email: users.email, fullName: userFullNameSQL(users) }
        },
        shares: sql`IF (${sql.placeholder('withShares')}, ${concatDistinctObjectsInArray(shares.id, {
          id: shares.id,
          alias: shares.alias,
          name: shares.name,
          type: shares.type
        })}, '[]')`.mapWith(JSON.parse),
        syncs: sql`IF (${sql.placeholder('withSyncs')}, ${concatDistinctObjectsInArray(syncPaths.id, {
          id: syncPaths.id,
          clientId: syncClients.id,
          clientName: sql`JSON_VALUE(${syncClients.info}, '$.node')`
        })}, '[]')`.mapWith(JSON.parse),
        hasComments: sql<boolean>`IF (${sql.placeholder('withHasComments')}, ${fileHasCommentsSubquerySQL(files.id)}, 0)`.mapWith(Boolean)
      }
      this.spaceRootFilesQuery = this.db
        .select(select)
        .from(spacesRoots)
        .leftJoin(files, eq(files.id, spacesRoots.fileId))
        .leftJoin(users, eq(users.id, files.ownerId))
        .leftJoin(
          shares,
          and(
            eq(sql.placeholder('withShares'), sql.raw('1')),
            eq(shares.ownerId, sql.placeholder('userId')),
            isNull(shares.fileId),
            isNull(shares.parentId),
            eq(shares.spaceRootId, spacesRoots.id)
          )
        )
        .leftJoin(syncClients, and(eq(sql.placeholder('withSyncs'), sql.raw('1')), eq(syncClients.ownerId, sql.placeholder('userId'))))
        .leftJoin(
          syncPaths,
          and(
            eq(sql.placeholder('withSyncs'), sql.raw('1')),
            eq(syncPaths.clientId, syncClients.id),
            eq(syncPaths.spaceId, sql.placeholder('spaceId')),
            eq(syncPaths.spaceRootId, spacesRoots.id),
            isNull(syncPaths.fileId)
          )
        )
        .where(eq(spacesRoots.spaceId, sql.placeholder('spaceId')))
        .groupBy(files.id, spacesRoots.id)
        .prepare()
    }
    return this.spaceRootFilesQuery.execute({
      userId,
      spaceId,
      withHasComments: +!!options.withHasComments,
      withShares: +!!options.withShares,
      withSyncs: +!!options.withSyncs
    })
  }

  async getSpaceRoots(spaceId: number, userId?: number): Promise<SpaceRootProps[]> {
    const where: SQL<any>[] = [eq(spacesRoots.spaceId, spaceId)]
    if (userId) {
      where.push(eq(files.ownerId, userId))
    }
    return (await this.db
      .select({
        id: spacesRoots.id,
        alias: spacesRoots.alias,
        name: spacesRoots.name,
        permissions: spacesRoots.permissions,
        createdAt: spacesRoots.createdAt,
        ...(!userId && { owner: { id: files.ownerId } }),
        file: {
          id: files.id,
          path: filePathSQL(files),
          mime: files.mime
        }
      })
      .from(spacesRoots)
      .leftJoin(files, eq(files.id, spacesRoots.fileId))
      .where(and(...where))) as SpaceRootProps[]
  }

  async getSpaceMemberIds(spaceId: number): Promise<{ groupIds: number[]; userIds: number[] }> {
    const members = { userIds: [], groupIds: [] }
    for (const m of await this.db
      .select({
        userId: spacesMembers.userId,
        groupId: spacesMembers.groupId
      })
      .from(spacesMembers)
      .where(eq(spacesMembers.spaceId, spaceId))) {
      if (m.userId) {
        members.userIds.push(m.userId)
      } else {
        members.groupIds.push(m.groupId)
      }
    }
    return members
  }

  async updateMembers(
    spaceId: number,
    add: SpaceMemberDto[],
    update: Record<string | 'object', Partial<SpaceMembers> | SpaceMemberDto>[],
    remove: SpaceMemberDto[]
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
          await this.db.insert(spacesMembers).values({
            spaceId: spaceId,
            ...(m.type === MEMBER_TYPE.USER || m.type === MEMBER_TYPE.GUEST ? { userId: m.id } : { groupId: m.id }),
            role: m.spaceRole,
            permissions: m.permissions
          } as SpaceMembers),
          1
        )
        status[ACTION.ADD][`${m.type === MEMBER_TYPE.USER || m.type === MEMBER_TYPE.GUEST ? 'userIds' : 'groupIds'}`].push(m.id)
        this.logger.debug(`${this.updateMembers.name} - ${m.type} (${m.id}) added to the space (${spaceId})`)
      } catch (e) {
        this.logger.error(`${this.updateMembers.name} - ${m.type} (${m.id}) was not added to the space ${spaceId} ->  : ${e}`)
      }
    }
    // update
    for (const props of update) {
      const m: SpaceMemberDto = popFromObject('object', props)
      const spaceRole = popFromObject('spaceRole', props)
      if (Number.isInteger(spaceRole)) {
        props.role = spaceRole
      }
      try {
        dbCheckAffectedRows(
          await this.db
            .update(spacesMembers)
            .set(props)
            .where(
              and(
                eq(spacesMembers.spaceId, spaceId),
                eq(m.type === MEMBER_TYPE.USER || m.type === MEMBER_TYPE.GUEST ? spacesMembers.userId : spacesMembers.groupId, m.id)
              )
            )
            .limit(1),
          1
        )
        status[ACTION.UPDATE][`${m.type === MEMBER_TYPE.USER || m.type === MEMBER_TYPE.GUEST ? 'userIds' : 'groupIds'}`].push(m.id)
        this.logger.debug(`${this.updateMembers.name} - ${m.type} (${m.id}) was updated on space (${spaceId}) : ${JSON.stringify(props)}`)
      } catch (e) {
        this.logger.error(`${this.updateMembers.name} - ${m.type} (${m.id}) was not updated on space (${spaceId}) : ${JSON.stringify(props)} : ${e}`)
      }
    }
    // remove
    for (const m of remove) {
      try {
        dbCheckAffectedRows(
          await this.db
            .delete(spacesMembers)
            .where(
              and(
                eq(spacesMembers.spaceId, spaceId),
                eq(m.type === MEMBER_TYPE.USER || m.type === MEMBER_TYPE.GUEST ? spacesMembers.userId : spacesMembers.groupId, m.id)
              )
            ),
          1
        )
        status[ACTION.DELETE][`${m.type === MEMBER_TYPE.USER || m.type === MEMBER_TYPE.GUEST ? 'userIds' : 'groupIds'}`].push(m.id)
        this.logger.debug(`${this.updateMembers.name} - ${m.type} (${m.id}) removed from space (${spaceId})`)
      } catch (e) {
        this.logger.error(`${this.updateMembers.name} - ${m.type} (${m.id}) was not removed from space (${spaceId}) : ${e}`)
      }
    }
    return status
  }

  async updateSpaceRoots(
    userId: number,
    spaceId: number,
    add: SpaceRootProps[],
    update: Record<string | 'object', Partial<SpaceRootProps> | SpaceRootProps>[],
    remove: SpaceRootProps[]
  ): Promise<Record<Exclude<ACTION, ACTION.DELETE_PERMANENTLY>, SpaceRootProps[]>> {
    // store status
    const status = {} as Record<Exclude<ACTION, ACTION.DELETE_PERMANENTLY>, SpaceRootProps[]>
    // add
    for (const r of add) {
      if (await this.addRoot(userId, spaceId, r)) {
        ;(status[ACTION.ADD] ||= []).push(r)
      }
    }
    // update
    for (const props of update) {
      const r: SpaceRootProps = popFromObject('object', props)
      if (await this.updateRoot(props, { id: r.id })) {
        ;(status[ACTION.UPDATE] ||= []).push(r)
      }
    }
    // delete
    for (const r of remove) {
      if (await this.removeRoot(r.id)) {
        ;(status[ACTION.DELETE] ||= []).push(r)
      }
    }
    return status
  }

  @CacheDecorator()
  async spaceIds(userId: number): Promise<number[]> {
    if (!this.spaceIdsQuery) {
      const unionAlias = this.fromUserAndGroups({ id: spaces.id })
      this.spaceIdsQuery = this.db.select({ id: unionAlias.id }).from(unionAlias).groupBy(unionAlias.id).prepare()
    }
    return (await this.spaceIdsQuery.execute({ userId })).map((r: { id: number }) => r.id)
  }

  @CacheDecorator()
  async spaces(userId: number, withPermissions = false, fromId?: number): Promise<SpaceProps[]> {
    let pQuery: MySql2PreparedQuery<any>
    if (fromId) {
      pQuery = this.spaceFromIdWithPermissionsQuery
    } else if (withPermissions) {
      pQuery = this.spacesWithPermissionsQuery
    } else {
      pQuery = this.spacesQuery
    }
    if (!pQuery) {
      const selectUnion: Space | SelectedFields<any, any> = {
        id: spaces.id,
        alias: spaces.alias,
        name: spaces.name,
        description: spaces.description,
        enabled: spaces.enabled,
        createdAt: spaces.createdAt,
        modifiedAt: spaces.modifiedAt,
        ...(withPermissions && { permissions: spacesMembers.permissions, role: spacesMembers.role })
      }
      const unionAlias = this.fromUserAndGroups(selectUnion)
      const select: Space | SelectedFields<any, any> = {
        id: unionAlias.id,
        alias: unionAlias.alias,
        name: unionAlias.name,
        description: unionAlias.description,
        enabled: unionAlias.enabled,
        createdAt: unionAlias.createdAt,
        modifiedAt: unionAlias.modifiedAt,
        ...(withPermissions && {
          permissions: spaceGroupConcatPermissions(unionAlias.permissions),
          role: max(unionAlias.role)
        })
      }
      if (fromId) {
        pQuery = this.db.select(select).from(unionAlias).where(eq(unionAlias.id, fromId)).limit(1).prepare()
        this.spaceFromIdWithPermissionsQuery = pQuery
      } else {
        pQuery = this.db.select(select).from(unionAlias).groupBy(unionAlias.id).prepare()
        if (withPermissions) {
          this.spacesWithPermissionsQuery = pQuery
        } else {
          this.spacesQuery = pQuery
        }
      }
    }
    // SpaceProps instance is required, if the user is a space manager, he must have all permissions
    return (await pQuery.execute({ userId })).map((s: Partial<SpaceProps>) => new SpaceProps(s))
  }

  async spacesWithDetails(userId: number): Promise<SpaceProps[]> {
    if (!this.spacesWithDetailsQuery) {
      const selectUnion: Space | SelectedFields<any, any> = {
        id: spaces.id,
        alias: spaces.alias,
        name: spaces.name,
        description: spaces.description,
        enabled: spaces.enabled,
        permissions: spacesMembers.permissions,
        role: spacesMembers.role,
        createdAt: spaces.createdAt,
        modifiedAt: spaces.modifiedAt,
        disabledAt: spaces.disabledAt
      }
      const unionAlias = this.fromUserAndGroups(selectUnion)
      const managers: any = alias(users, 'managers')
      const select: Space | SelectedFields<any, any> = {
        id: unionAlias.id,
        alias: unionAlias.alias,
        name: unionAlias.name,
        description: unionAlias.description,
        enabled: unionAlias.enabled,
        permissions: spaceGroupConcatPermissions(unionAlias.permissions),
        role: max(unionAlias.role),
        modifiedAt: unionAlias.modifiedAt,
        createdAt: unionAlias.createdAt,
        disabledAt: unionAlias.disabledAt,
        members: concatDistinctObjectsInArray(managers.id, {
          id: managers.id,
          login: managers.login,
          name: userFullNameSQL(managers),
          description: managers.email,
          type: sql.raw(`'${MEMBER_TYPE.USER}'`),
          spaceRole: spacesMembers.role,
          permissions: sql<string>`''`,
          createdAt: dateTimeUTC(spacesMembers.createdAt)
        } satisfies Record<keyof Pick<Member, 'id' | 'name' | 'login' | 'description' | 'type' | 'permissions' | 'spaceRole' | 'createdAt'>, any>),
        counts: {
          users: sql`COUNT(DISTINCT(CASE WHEN ${spacesMembers.userId} IS NOT NULL AND ${spacesMembers.linkId} IS NULL THEN ${spacesMembers.userId} END))`,
          groups: countDistinct(spacesMembers.groupId),
          links: sql`COUNT(DISTINCT(CASE WHEN ${spacesMembers.linkId} IS NOT NULL THEN ${spacesMembers.linkId} END))`,
          roots: countDistinct(files.id),
          shares: sql`COUNT(DISTINCT(CASE WHEN ${shares.id} IS NOT NULL THEN ${shares.id} END))`
        }
      }
      this.spacesWithDetailsQuery = this.db
        .select(select)
        .from(unionAlias)
        .leftJoin(spacesMembers, eq(spacesMembers.spaceId, unionAlias.id))
        .leftJoin(users, eq(users.id, spacesMembers.userId))
        .leftJoin(groups, eq(groups.id, spacesMembers.groupId))
        .leftJoin(managers, and(eq(spacesMembers.userId, managers.id), eq(spacesMembers.role, SPACE_ROLE.IS_MANAGER)))
        .leftJoin(spacesRoots, eq(spacesRoots.spaceId, unionAlias.id))
        .leftJoin(files, and(eq(files.id, spacesRoots.fileId), eq(files.ownerId, sql.placeholder('userId'))))
        .leftJoin(shares, and(eq(unionAlias.role, 1), eq(shares.spaceId, unionAlias.id), isNotNull(shares.spaceId)))
        .groupBy(unionAlias.id)
        .prepare()
    }
    const r: MySqlQueryResult = await this.spacesWithDetailsQuery.execute({ userId })
    return r.length ? r.map((s: Partial<SpaceProps>) => new SpaceProps(s)) : []
  }

  @CacheDecorator()
  async permissions(userId: number, spaceAlias: string, rootAlias: string): Promise<Partial<SpaceEnv>> {
    if (rootAlias) {
      return await this.spaceAndRootPermissions(userId, spaceAlias, rootAlias)
    }
    return await this.spacePermissions(userId, spaceAlias)
  }

  async addRoot(userId: number, spaceId: number, root: SpaceRootProps): Promise<boolean> {
    const r: Partial<SpaceRoot> = { name: root.name, alias: root.alias, permissions: root.permissions, spaceId: spaceId }
    if (root.externalPath) {
      r.externalPath = root.externalPath
    } else {
      r.fileId = await this.getOrCreateUserFile(userId, root.file)
    }
    try {
      dbCheckAffectedRows(await this.db.insert(spacesRoots).values(r as SpaceRoot), 1)
      this.logger.debug(`${this.addRoot.name} - *${root.alias}* (${root.id}) added`)
      return true
    } catch (e) {
      this.logger.error(`${this.addRoot.name} - *${root.alias}* (${root.id}) was not added : ${JSON.stringify(root)} : ${e}`)
      return false
    }
  }

  async updateRoot(set: Partial<Record<keyof SpaceRoot, any>>, filters: Partial<Record<keyof SpaceRoot, any>>): Promise<boolean> {
    const where: SQL[] = convertToWhere(spacesRoots, filters)
    try {
      dbCheckAffectedRows(
        await this.db
          .update(spacesRoots)
          .set(set)
          .where(and(...where))
          .limit(1),
        1
      )
      this.logger.debug(`${this.updateRoot.name} - ${JSON.stringify(filters)} was updated : ${JSON.stringify(set)}`)
      return true
    } catch (e) {
      this.logger.error(`${this.updateRoot.name} - ${JSON.stringify(filters)} was not updated : ${JSON.stringify(set)} : ${e}`)
      return false
    }
  }

  async getOrCreateUserFile(userId: number, file: FileProps): Promise<number> {
    return this.filesQueries.getOrCreateUserFile(userId, file)
  }

  async getOrCreateSpaceFile(fileId: number, file: FileProps, dbFile: FileDBProps): Promise<number> {
    return this.filesQueries.getOrCreateSpaceFile(fileId, file, dbFile)
  }

  async clearCachePermissions(spaceAlias: string, rootAliases?: string[], userIds?: number[]) {
    const uIds = userIds ?? ['*']
    for (const uid of uIds) {
      const basePattern = [this.constructor.name, this.permissions.name, uid, spaceAlias]
      const patterns: string[] = []
      if (rootAliases?.length) {
        // clear cache on space root
        rootAliases.forEach((rAlias: string) => patterns.push(this.cache.genSlugKey(...basePattern, rAlias)))
      } else {
        // clear cache on spaces list
        patterns.push(this.cache.genSlugKey(...[this.constructor.name, this.spaces.name, uid, '*']))
        // clear cache on spaces and roots
        patterns.push(this.cache.genSlugKey(...basePattern), this.cache.genSlugKey(...basePattern, '*'))
      }
      for (const p of patterns) {
        const keys = await this.cache.keys(p)
        if (keys.length) {
          this.logger.verbose(`${this.clearCachePermissions.name} - ${JSON.stringify(keys)}`)
          this.cache.mdel(keys).catch((e: Error) => this.logger.error(`${this.clearCachePermissions.name} - ${e}`))
        }
      }
    }
  }

  private async removeRoot(id: number): Promise<boolean> {
    try {
      dbCheckAffectedRows(await this.db.delete(spacesRoots).where(eq(spacesRoots.id, id)), 1)
      this.logger.debug(`${this.removeRoot.name} - root (${id}) removed`)
      return true
    } catch (e) {
      this.logger.error(`${this.removeRoot.name} - root (${id}) was not deleted : ${e}`)
      return false
    }
  }

  private async spacePermissions(userId: number, spaceAlias: string): Promise<Partial<SpaceEnv>> {
    if (!this.spacePermissionsQuery) {
      const selectUnion: SpaceEnv | SelectedFields<any, any> = {
        id: spaces.id,
        alias: spaces.alias,
        name: spaces.name,
        enabled: spaces.enabled,
        permissions: spacesMembers.permissions,
        role: spacesMembers.role
      }
      const filters: SQL[] = [eq(spaces.alias, sql.placeholder('spaceAlias'))]
      const unionAlias = this.fromUserAndGroups(selectUnion, filters)
      const select: SpaceEnv | SelectedFields<any, any> = {
        id: unionAlias.id,
        alias: unionAlias.alias,
        name: unionAlias.name,
        enabled: unionAlias.enabled,
        permissions: spaceGroupConcatPermissions(unionAlias.permissions),
        role: max(unionAlias.role)
      }
      this.spacePermissionsQuery = this.db.select(select).from(unionAlias).groupBy(unionAlias.id).limit(1).prepare()
    }
    const r: MySqlQueryResult = await this.spacePermissionsQuery.execute({ userId, spaceAlias })
    return r.length ? r.at(0) : null
  }

  private async spaceAndRootPermissions(userId: number, spaceAlias: string, rootAlias: string): Promise<Partial<SpaceEnv>> {
    if (!this.spaceAndRootPermissionsQuery) {
      const selectUnion: SpaceEnv | SelectedFields<any, any> = {
        id: spaces.id,
        alias: spaces.alias,
        name: spaces.name,
        enabled: spaces.enabled,
        permissions: spacesMembers.permissions,
        role: spacesMembers.role,
        rootId: sql`${spacesRoots.id}`.as('rootId'),
        rootAlias: sql`${spacesRoots.alias}`.as('rootAlias'),
        rootName: sql`${spacesRoots.name}`.as('rootName'),
        rootPermissions: sql`${spacesRoots.permissions}`.as('rootPermissions'),
        rootOwnerId: files.ownerId,
        rootOwnerLogin: users.login,
        rootFileId: sql`${files.id}`.as('rootFileId'),
        rootFilePath: filePathSQL(files).as('rootFilePath'),
        rootFileInTrash: files.inTrash,
        rootExternalPath: spacesRoots.externalPath
      }
      const filters: SQL[] = [eq(spaces.alias, sql.placeholder('spaceAlias'))]
      const fromUser = this.fromUserQuery(selectUnion, filters).$dynamic()
      const fromGroups = this.fromGroupsQuery(selectUnion, filters).$dynamic()
      for (const q of [fromUser, fromGroups]) {
        q.leftJoin(spacesRoots, and(eq(spacesRoots.spaceId, spacesMembers.spaceId), eq(spacesRoots.alias, sql.placeholder('rootAlias'))))
          .leftJoin(files, eq(files.id, spacesRoots.fileId))
          .leftJoin(users, eq(users.id, files.ownerId))
      }
      const unionAlias = union(fromUser, fromGroups).as('union_alias')
      const select: SpaceEnv | SelectedFields<any, any> = {
        id: unionAlias.id,
        alias: unionAlias.alias,
        name: unionAlias.name,
        enabled: unionAlias.enabled,
        permissions: spaceGroupConcatPermissions(unionAlias.permissions),
        role: sql<SPACE_ROLE>`MAX(${unionAlias.role})`,
        root: {
          id: unionAlias.rootId,
          alias: unionAlias.rootAlias,
          name: unionAlias.rootName,
          permissions: unionAlias.rootPermissions,
          owner: { id: unionAlias.rootOwnerId, login: unionAlias.rootOwnerLogin },
          file: { id: unionAlias.rootFileId, path: unionAlias.rootFilePath, inTrash: unionAlias.rootFileInTrash },
          externalPath: unionAlias.rootExternalPath
        }
      }
      this.spaceAndRootPermissionsQuery = this.db.select(select).from(unionAlias).groupBy(unionAlias.id).limit(1).prepare()
    }
    const r: MySqlQueryResult = await this.spaceAndRootPermissionsQuery.execute({ userId, spaceAlias, rootAlias })
    return r.length ? r.at(0) : null
  }

  private fromUserAndGroups(select: SelectedFields<any, any>, filters: SQL[] = []) {
    return union(this.fromUserQuery(select, filters), this.fromGroupsQuery(select, filters)).as('union_alias')
  }

  private fromUserQuery(select: SelectedFields<any, any>, filters: SQL[] = []) {
    const where = [eq(spacesMembers.userId, sql.placeholder('userId')), ...filters]
    return this.db
      .select(select)
      .from(spacesMembers)
      .innerJoin(spaces, eq(spacesMembers.spaceId, spaces.id))
      .where(and(...where))
  }

  private fromGroupsQuery(select: SelectedFields<any, any>, filters: SQL[] = []) {
    const where = [eq(spacesMembers.groupId, usersGroups.groupId), ...filters]
    return this.db
      .select(select)
      .from(spacesMembers)
      .innerJoin(usersGroups, eq(usersGroups.userId, sql.placeholder('userId')))
      .innerJoin(spaces, eq(spacesMembers.spaceId, spaces.id))
      .where(and(...where))
  }
}
