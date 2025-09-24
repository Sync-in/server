/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Inject, Injectable, Logger } from '@nestjs/common'
import { and, countDistinct, eq, inArray, like, lte, ne, notInArray, or, SelectedFields, SQL, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/mysql-core'
import { MySql2PreparedQuery, MySqlQueryResult } from 'drizzle-orm/mysql2'
import { anonymizePassword, comparePassword, uniquePermissions } from '../../../common/functions'
import { CacheDecorator } from '../../../infrastructure/cache/cache.decorator'
import { Cache } from '../../../infrastructure/cache/services/cache.service'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import { DBSchema } from '../../../infrastructure/database/interfaces/database.interface'
import {
  concatDistinctObjectsInArray,
  convertToSelect,
  dateTimeUTC,
  dbCheckAffectedRows,
  dbGetInsertedId
} from '../../../infrastructure/database/utils'
import { GROUP_TYPE, GROUP_VISIBILITY } from '../constants/group'
import { MEMBER_TYPE } from '../constants/member'
import { USER_GROUP_ROLE, USER_ONLINE_STATUS, USER_PERMS_SEP, USER_ROLE } from '../constants/user'
import { UserCreateOrUpdateGroupDto } from '../dto/create-or-update-group.dto'
import { CreateUserDto } from '../dto/create-or-update-user.dto'
import { SearchMembersDto } from '../dto/search-members.dto'
import { GroupMember, GroupWithMembers } from '../interfaces/group-member'
import { GuestUser } from '../interfaces/guest-user.interface'
import { Member } from '../interfaces/member.interface'
import { UserSecrets } from '../interfaces/user-secrets.interface'
import { UserOnline } from '../interfaces/websocket.interface'
import { UserModel } from '../models/user.model'
import { Group } from '../schemas/group.interface'
import { groups } from '../schemas/groups.schema'
import { UserGroup } from '../schemas/user-group.interface'
import { User } from '../schemas/user.interface'
import { usersGroups } from '../schemas/users-groups.schema'
import { usersGuests } from '../schemas/users-guests.schema'
import { userFullNameSQL, users } from '../schemas/users.schema'

@Injectable()
export class UsersQueries {
  private readonly logger = new Logger(UsersQueries.name)
  private fromLoginOrEmailPermissionsQuery: MySql2PreparedQuery<any> = null
  private fromIdPermissionsQuery: MySql2PreparedQuery<any> = null

  constructor(
    @Inject(DB_TOKEN_PROVIDER) private readonly db: DBSchema,
    private readonly cache: Cache
  ) {}

  checkUserExists(login?: string, email?: string): Promise<{ login?: string; email?: string }> {
    if (!login && !email) {
      throw new Error('login or email must be specified')
    }
    const columns: { login?: boolean; email?: boolean } = {}
    const where: SQL[] = []
    if (login) {
      columns.login = true
      where.push(eq(users.login, login))
    }
    if (email) {
      columns.email = true
      where.push(eq(users.email, email))
    }
    const operator = login && email ? or : and
    return this.db.query.users.findFirst({
      columns: columns,
      where: operator(...where)
    })
  }

  setOnlineStatus(userId: number, onlineStatus: USER_ONLINE_STATUS): Promise<boolean> {
    return this.updateUserOrGuest(userId, { onlineStatus: onlineStatus })
  }

  getOnlineUsers(userIds: number[]): Promise<UserOnline[]> {
    return this.db
      .select({
        id: users.id,
        login: users.login,
        email: users.email,
        fullName: userFullNameSQL(users),
        onlineStatus: users.onlineStatus
      } satisfies UserOnline | SelectedFields<any, any>)
      .from(users)
      .where(inArray(users.id, userIds))
  }

  async checkGroupNameExists(groupName: string): Promise<boolean> {
    const [group] = await this.db.select({ name: groups.name }).from(groups).where(eq(groups.name, groupName)).limit(1)
    return !!group?.name
  }

  async compareUserPassword(userId: number, password: string): Promise<boolean> {
    const [hash] = (await this.selectUsers(['password'], [eq(users.id, userId)])) as { password: string }[]
    if (!hash) return false
    return comparePassword(password, hash.password)
  }

  async from(userId?: number, loginOrEmail?: string): Promise<User> {
    // retrieve user with application permissions
    let pQuery: MySql2PreparedQuery<any> = userId ? this.fromIdPermissionsQuery : this.fromLoginOrEmailPermissionsQuery
    if (!pQuery) {
      const where = userId
        ? eq(users.id, sql.placeholder('userId'))
        : or(eq(users.login, sql.placeholder('loginOrEmail')), eq(users.email, sql.placeholder('loginOrEmail')))
      pQuery = this.db
        .select({
          user: users,
          groupsPermissions: sql`GROUP_CONCAT(DISTINCT (${groups.permissions}) SEPARATOR ${USER_PERMS_SEP})`
        })
        .from(users)
        .leftJoin(usersGroups, eq(usersGroups.userId, users.id))
        .leftJoin(groups, and(eq(groups.id, usersGroups.groupId), ne(groups.permissions, '')))
        .where(where)
        .groupBy(users.id)
        .limit(1)
        .prepare()
      if (userId) {
        this.fromIdPermissionsQuery = pQuery
      } else {
        this.fromLoginOrEmailPermissionsQuery = pQuery
      }
    }
    const r = await pQuery.execute(userId ? { userId } : { loginOrEmail })
    if (!r.length) return null
    const [user, groupsPermissions] = [r[0].user, r[0].groupsPermissions]
    // merge user and groups permissions
    user.permissions = uniquePermissions(`${user.permissions},${groupsPermissions}`, USER_PERMS_SEP)
    return user
  }

  async getUserSecrets(userId: number): Promise<UserSecrets> {
    const [r]: { secrets: UserSecrets }[] = await this.db.select({ secrets: users.secrets }).from(users).where(eq(users.id, userId)).limit(1)
    return r.secrets || {}
  }

  selectUsers(fields: Partial<keyof User>[] = ['id', 'login', 'email'], where: SQL[]): Promise<Partial<User>[]> {
    const select: Record<keyof User, any> = convertToSelect(users, fields)
    return this.db
      .select(select)
      .from(users)
      .where(and(...where))
  }

  async selectUserProperties(userId: number, fields: Partial<keyof User>[]): Promise<Partial<User>> {
    const select: Record<keyof User, any> = convertToSelect(users, fields)
    const [r]: Record<string, any>[] = await this.db.select(select).from(users).where(eq(users.id, userId)).limit(1)
    return r
  }

  async createUserOrGuest(createUserDto: CreateUserDto, userRole: USER_ROLE): Promise<User['id']> {
    const userId: number = dbGetInsertedId(await this.db.insert(users).values({ ...createUserDto, role: userRole } as User))
    if (userRole === USER_ROLE.USER && createUserDto.groups?.length) {
      await this.db.insert(usersGroups).values(createUserDto.groups.map((gid: number) => ({ userId: userId, groupId: gid })))
    }
    if (userRole === USER_ROLE.GUEST && createUserDto.managers?.length) {
      await this.db.insert(usersGuests).values(createUserDto.managers.map((uid: number) => ({ guestId: userId, userId: uid })))
    }
    return userId
  }

  async updateUserOrGuest(userId: number, set: Partial<Record<keyof User, any>>, userRole?: USER_ROLE): Promise<boolean> {
    try {
      dbCheckAffectedRows(
        await this.db
          .update(users)
          .set({ ...set, ...(userRole && { role: userRole }) } as User)
          .where(eq(users.id, userId)),
        1
      )
      this.logger.verbose(`${this.updateUserOrGuest.name} - user (${userId}) was updated : ${JSON.stringify(anonymizePassword(set))}`)
      return true
    } catch (e) {
      this.logger.error(`${this.updateUserOrGuest.name} - user (${userId}) was not updated : ${JSON.stringify(anonymizePassword(set))} : ${e}`)
      return false
    }
  }

  async deleteGuestLink(userId: number): Promise<void> {
    dbCheckAffectedRows(await this.db.delete(users).where(and(eq(users.id, userId), eq(users.role, USER_ROLE.LINK))), 1)
  }

  async searchUsersOrGroups(searchMembersDto: SearchMembersDto, userId?: number): Promise<Member[]> {
    const limit = searchMembersDto.onlyUsers || searchMembersDto.onlyGroups ? 6 : 3
    const members: Member[] = []
    if (!searchMembersDto.onlyGroups) {
      for (const u of await this.searchUsers(searchMembersDto, userId, limit)) {
        members.push({
          id: u.id,
          login: u.login,
          name: u.fullName,
          description: u.email,
          type: u.role === USER_ROLE.GUEST ? MEMBER_TYPE.GUEST : MEMBER_TYPE.USER,
          permissions: searchMembersDto.withPermissions ? u.permissions : undefined
        })
      }
    }
    if (!searchMembersDto.onlyUsers) {
      for (const g of await this.searchGroups(searchMembersDto, userId, limit)) {
        members.push({
          id: g.id,
          name: g.name,
          description: g.description,
          type: g.type === GROUP_TYPE.USER ? MEMBER_TYPE.GROUP : MEMBER_TYPE.PGROUP,
          permissions: searchMembersDto.withPermissions ? g.permissions : undefined
        })
      }
    }
    return members
  }

  async groupFromName(userId: number, name: string): Promise<Pick<Group, 'id' | 'name' | 'type'> & { role: UserGroup['role'] }> {
    const [group] = await this.db
      .select({
        id: groups.id,
        name: groups.name,
        type: groups.type,
        role: usersGroups.role
      } satisfies (Pick<Group, 'id' | 'name' | 'type'> & { role: UserGroup['role'] }) | SelectedFields<any, any>)
      .from(usersGroups)
      .innerJoin(groups, eq(groups.id, usersGroups.groupId))
      .where(and(eq(usersGroups.userId, userId), eq(groups.name, name)))
      .limit(1)
    return group
  }

  async browseRootGroups(userId: number): Promise<Member[]> {
    const members = alias(usersGroups, 'members')
    return this.db
      .select({
        id: groups.id,
        name: groups.name,
        description: groups.description,
        createdAt: groups.createdAt,
        modifiedAt: groups.modifiedAt,
        type: sql<MEMBER_TYPE>`IF(${groups.type} = ${GROUP_TYPE.USER}, ${MEMBER_TYPE.GROUP}, ${MEMBER_TYPE.PGROUP})`,
        groupRole: sql<USER_GROUP_ROLE>`${usersGroups.role}`,
        counts: { users: countDistinct(members.userId) }
      } satisfies Member | SelectedFields<any, any>)
      .from(usersGroups)
      .innerJoin(groups, and(eq(groups.id, usersGroups.groupId), eq(usersGroups.userId, userId)))
      .leftJoin(members, eq(members.groupId, groups.id))
      .groupBy(groups.id)
  }

  async browseGroupMembers(groupId: number): Promise<Member[]> {
    return this.db
      .select({
        id: users.id,
        login: users.login,
        name: userFullNameSQL(users).as('name'),
        description: users.email,
        createdAt: usersGroups.createdAt,
        type: sql<MEMBER_TYPE>`${MEMBER_TYPE.USER}`,
        groupRole: sql<USER_GROUP_ROLE>`${usersGroups.role}`
      } satisfies Member | SelectedFields<any, any>)
      .from(groups)
      .innerJoin(usersGroups, and(eq(usersGroups.groupId, groups.id), eq(usersGroups.groupId, groupId)))
      .leftJoin(users, eq(users.id, usersGroups.userId))
      .groupBy(users.id)
  }

  async canDeletePersonalGroup(userId: number, groupId: number): Promise<boolean> {
    const [group] = await this.db
      .select({ id: usersGroups.groupId })
      .from(usersGroups)
      .innerJoin(groups, and(eq(groups.id, usersGroups.groupId)))
      .where(
        and(
          eq(groups.type, GROUP_TYPE.PERSONAL),
          eq(usersGroups.userId, userId),
          eq(usersGroups.groupId, groupId),
          eq(usersGroups.role, USER_GROUP_ROLE.MANAGER)
        )
      )
      .limit(1)
    return !!group?.id
  }

  async getGroup(userId: number, groupId: number, asAdmin = false): Promise<GroupMember> {
    const [group] = await this.db
      .select({
        id: groups.id,
        name: groups.name,
        description: groups.description,
        createdAt: groups.createdAt,
        modifiedAt: groups.modifiedAt,
        type: sql<MEMBER_TYPE>`IF(${groups.type} = ${GROUP_TYPE.USER}, ${MEMBER_TYPE.GROUP}, ${MEMBER_TYPE.PGROUP})`
      })
      .from(usersGroups)
      .innerJoin(groups, and(eq(groups.id, usersGroups.groupId)))
      .where(
        and(
          eq(usersGroups.groupId, groupId),
          sql`IF(${+asAdmin} = 0, ${usersGroups.userId} = ${userId} AND ${usersGroups.role} = ${USER_GROUP_ROLE.MANAGER}, 1)`
        )
      )
      .limit(1)
    return group
  }

  async getGroupWithMembers(userId: number, groupId: number, asAdmin = false): Promise<GroupWithMembers> {
    const usersGroupsAlias: any = alias(usersGroups, 'usersFromGroups')
    const [group] = await this.db
      .select({
        id: groups.id,
        name: groups.name,
        description: groups.description,
        createdAt: groups.createdAt,
        modifiedAt: groups.modifiedAt,
        type: sql<MEMBER_TYPE>`IF(${groups.type} = ${GROUP_TYPE.USER}, ${sql.raw(`'${MEMBER_TYPE.GROUP}'`)}, ${sql.raw(`'${MEMBER_TYPE.PGROUP}'`)})`,
        members: concatDistinctObjectsInArray(users.id, {
          id: users.id,
          login: users.login,
          name: userFullNameSQL(users),
          description: users.email,
          type: sql.raw(`'${MEMBER_TYPE.USER}'`),
          groupRole: usersGroupsAlias.role,
          createdAt: dateTimeUTC(usersGroupsAlias.createdAt)
        } satisfies Record<keyof Pick<Member, 'id' | 'name' | 'login' | 'description' | 'type' | 'groupRole' | 'createdAt'>, any>)
      } satisfies GroupWithMembers | SelectedFields<any, any>)
      .from(usersGroups)
      .innerJoin(groups, eq(groups.id, usersGroups.groupId))
      .leftJoin(usersGroupsAlias, and(eq(usersGroupsAlias.groupId, groups.id)))
      .leftJoin(users, eq(users.id, usersGroupsAlias.userId))
      .where(
        and(
          eq(usersGroups.groupId, groupId),
          sql`IF(${+asAdmin} = 0, ${usersGroups.userId} = ${userId} AND ${usersGroups.role} = ${USER_GROUP_ROLE.MANAGER}, 1)`
        )
      )
      .groupBy(groups.id)
      .limit(1)
    return group
  }

  async deletePersonalGroup(groupId: number): Promise<boolean> {
    return dbCheckAffectedRows(
      await this.db
        .delete(groups)
        .where(and(eq(groups.id, groupId), eq(groups.type, GROUP_TYPE.PERSONAL)))
        .limit(1),
      1,
      false
    )
  }

  async createPersonalGroup(managerId: number, userCreateOrUpdateGroupDto: UserCreateOrUpdateGroupDto): Promise<Group['id']> {
    const groupId: number = dbGetInsertedId(
      await this.db.insert(groups).values({
        ...userCreateOrUpdateGroupDto,
        type: GROUP_TYPE.PERSONAL,
        visibility: GROUP_VISIBILITY.PRIVATE
      } as Group)
    )
    await this.db.insert(usersGroups).values({ userId: managerId, groupId: groupId, role: USER_GROUP_ROLE.MANAGER } as UserGroup)
    return groupId
  }

  async updateGroup(groupId: number, set: Partial<Record<keyof Group, any>>) {
    if (Object.keys(set).length) {
      try {
        await this.db.update(groups).set(set).where(eq(groups.id, groupId))
        this.logger.log(`${this.updateGroup.name} - group (${groupId}) was updated : ${JSON.stringify(set)}`)
      } catch (e) {
        this.logger.error(`${this.updateGroup.name} - group (${groupId}) was not updated : ${JSON.stringify(set)} : ${e}`)
        throw new Error('Group was not updated')
      }
    }
  }

  async updateGroupMembers(
    groupId: number,
    members: {
      add?: Pick<Member, 'id' | 'groupRole'>[]
      remove?: UserGroup['userId'][]
    }
  ): Promise<void> {
    if (members?.add?.length) {
      try {
        await this.db.insert(usersGroups).values(members.add.map((m) => ({ userId: m.id, groupId: groupId, role: m.groupRole })))
        // clear cache
        this.clearWhiteListCaches(members.add.map((m) => m.id))
        this.logger.log(`${this.updateGroupMembers.name} - users ${JSON.stringify(members.add.map((m) => m.id))} was added to group (${groupId})`)
      } catch (e) {
        this.logger.error(
          `${this.updateGroupMembers.name} - users ${JSON.stringify(members.add.map((m) => m.id))} was not added to group (${groupId}) : ${e}`
        )
        throw new Error('Group members was not added')
      }
    }
    if (members?.remove?.length) {
      try {
        await this.db
          .delete(usersGroups)
          .where(and(eq(usersGroups.groupId, groupId), inArray(usersGroups.userId, members.remove)))
          .limit(members.remove.length)
        // clear cache
        this.clearWhiteListCaches(members.remove)
        this.logger.log(`${this.updateGroupMembers.name} - users ${JSON.stringify(members.remove)} was removed from group (${groupId})`)
      } catch (e) {
        this.logger.error(`${this.updateGroupMembers.name} - users ${JSON.stringify(members.remove)} was not removed from group (${groupId}) : ${e}`)
        throw new Error('Group members was not removed')
      }
    }
  }

  async listGuests(guestId: null, managerId?: number, asAdmin?: boolean): Promise<GuestUser[]>
  async listGuests(guestId: number, managerId?: number, asAdmin?: boolean): Promise<GuestUser>
  async listGuests(guestId: number | null, managerId?: number, asAdmin = false): Promise<GuestUser | GuestUser[]> {
    const where: SQL[] = [...(guestId ? [eq(usersGuests.guestId, guestId)] : []), ...(asAdmin ? [] : [eq(usersGuests.userId, managerId)])]
    const managersGuestAlias: any = alias(usersGuests, 'managersGuestAlias')
    const managersAlias: any = alias(users, 'managersAlias')
    const guests = await this.db
      .select({
        id: users.id,
        login: users.login,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        fullName: userFullNameSQL(users),
        role: users.role,
        isActive: users.isActive,
        passwordAttempts: users.passwordAttempts,
        language: users.language,
        notification: users.notification,
        currentAccess: users.currentAccess,
        lastAccess: users.lastAccess,
        currentIp: users.currentIp,
        lastIp: users.lastIp,
        createdAt: users.createdAt,
        managers: concatDistinctObjectsInArray(managersAlias.id, {
          id: managersAlias.id,
          login: managersAlias.login,
          name: userFullNameSQL(managersAlias),
          type: sql.raw(`'${MEMBER_TYPE.USER}'`),
          description: managersAlias.email,
          createdAt: dateTimeUTC(managersGuestAlias.createdAt)
        } satisfies Record<keyof Pick<Member, 'id' | 'name' | 'login' | 'description' | 'type' | 'createdAt'>, any>)
      } satisfies GuestUser | SelectedFields<any, any>)
      .from(usersGuests)
      .innerJoin(users, and(eq(users.id, usersGuests.guestId), eq(users.role, USER_ROLE.GUEST)))
      .leftJoin(managersGuestAlias, eq(managersGuestAlias.guestId, users.id))
      .leftJoin(managersAlias, eq(managersAlias.id, managersGuestAlias.userId))
      .where(and(...where))
      .groupBy(users.id)
      .limit(guestId ? 1 : undefined)
    return guestId ? guests[0] : guests
  }

  async isGuestManager(managerId: number, guestId: number): Promise<{ id: number; login: string } | undefined> {
    const [guest] = await this.db
      .select({ id: usersGuests.guestId, login: users.login })
      .from(usersGuests)
      .innerJoin(users, eq(users.id, usersGuests.guestId))
      .where(and(eq(usersGuests.userId, managerId), eq(usersGuests.guestId, guestId), eq(users.role, USER_ROLE.GUEST)))
      .limit(1)
    return guest
  }

  @CacheDecorator(900)
  async usersWhitelist(userId: number, lowerOrEqualUserRole: USER_ROLE = USER_ROLE.GUEST): Promise<number[]> {
    /* Get the list of user ids allowed to the current user
      - all users with no groups (except link users)
      - all users who are members of the current user's groups (excluding link users and members of isolated groups)
      - all guests managed by the current user
      - all managers who manage the current guest
    */
    const usersAlias: any = alias(users, 'usersAlias')
    const groupsAlias: any = alias(groups, 'groupsAlias')
    const userIds: any = sql`
      WITH RECURSIVE children (id, parentId) AS
                       (SELECT ${groups.id},
                               ${groups.parentId}
                        FROM ${groups}
                        WHERE (${groups.id} IN (SELECT ${usersGroups.groupId}
                                                FROM ${usersGroups}
                                                WHERE ${usersGroups.userId} = ${userId}
                                                  AND ${groups.visibility} != ${GROUP_VISIBILITY.ISOLATED}))
                        UNION
                        SELECT ${groupsAlias.id},
                               ${groupsAlias.parentId}
                        FROM ${groups} AS groupsAlias
                               INNER JOIN children cs ON ${groupsAlias.parentId} = cs.id AND ${groupsAlias.visibility} = ${sql.raw(`${GROUP_VISIBILITY.VISIBLE}`)})
      SELECT JSON_ARRAYAGG(id) AS ids
      FROM (
             -- Users from visible child groups
             SELECT ${users.id} AS id
             FROM children
                    INNER JOIN ${usersGroups} ON ${usersGroups.groupId} = children.id
                    INNER JOIN ${users} ON ${usersGroups.userId} = ${users.id} AND ${users.role} <= ${sql.raw(`${lowerOrEqualUserRole}`)}

             UNION
             -- Users visible but not assigned to groups
             SELECT ${usersAlias.id} AS id
             FROM ${users} AS usersAlias
                    INNER JOIN ${users} ON ${users.id} = ${usersAlias.id} AND ${users.role} <= ${sql.raw(`${lowerOrEqualUserRole}`)}
             WHERE NOT EXISTS (SELECT ${usersGroups.userId} FROM ${usersGroups} WHERE ${usersGroups.userId} = ${usersAlias.id})
             UNION
             -- Users or guests that are manager/managed
             SELECT CASE
                      WHEN ${usersGuests.userId} = ${userId} THEN ${usersGuests.guestId}
                      WHEN ${usersGuests.guestId} = ${userId} THEN ${usersGuests.userId}
                      END AS id
             FROM ${usersGuests}
             WHERE ${usersGuests.userId} = ${userId}
                OR ${usersGuests.guestId} = ${userId}) AS usersUnion
    `
    const [r] = await this.db.execute(userIds)
    return JSON.parse(r[0].ids) || []
  }

  @CacheDecorator(900)
  async groupsWhitelist(userId: number): Promise<number[]> {
    /* Get the list of groups ids allowed to the current user
      - all parent groups for which the user is a member (includes personal groups, excludes isolated groups)
      - all subgroups inherited from parent groups
    */
    const groupsAlias: any = alias(groups, 'groupsAlias')
    const groupIds: any = sql`
      WITH RECURSIVE children (id, parentId, type) AS
                       (SELECT ${groups.id},
                               ${groups.parentId},
                               ${groups.type}
                        FROM ${groups}
                        WHERE (${groups.id} IN (SELECT ${usersGroups.groupId}
                                                FROM ${usersGroups}
                                                WHERE ${usersGroups.userId} = ${userId}
                                                  AND ${groups.visibility} != ${GROUP_VISIBILITY.ISOLATED}))
                        UNION
                        SELECT ${groupsAlias.id},
                               ${groupsAlias.parentId},
                               ${groupsAlias.type}
                        FROM ${groups} AS groupsAlias
                               INNER JOIN children cs ON ${groupsAlias.parentId} = cs.id AND ${groupsAlias.visibility} = ${GROUP_VISIBILITY.VISIBLE})
      SELECT JSON_ARRAYAGG(children.id) as ids
      FROM children
    `
    const [r] = await this.db.execute(groupIds)
    return JSON.parse(r[0].ids) || []
  }

  clearWhiteListCaches(userIds: number[]) {
    this.cache
      .mdel([
        ...userIds.map((id) => this.cache.genSlugKey(this.constructor.name, this.usersWhitelist.name, id)),
        ...userIds.map((id) => this.cache.genSlugKey(this.constructor.name, this.groupsWhitelist.name, id))
      ])
      .catch((e: Error) => this.logger.error(`${this.clearWhiteListCaches.name} - ${e}`))
  }

  async allUserIdsFromGroupsAndSubGroups(groupIds: number[]): Promise<number[]> {
    if (!groupIds.length) return []
    const subGroup: any = alias(groups, 'subGroup')
    const withChildren: any = sql`
      WITH RECURSIVE child (id, parentId) AS
                       (SELECT ${groups.id}, ${groups.parentId}
                        FROM ${groups}
                        WHERE ${inArray(groups.id, groupIds)}
                        UNION
                        SELECT ${subGroup.id},
                               ${subGroup.parentId}
                        FROM ${groups} AS subGroup
                               INNER JOIN child AS cs ON ${subGroup.parentId} = cs.id)
      SELECT DISTINCT ${usersGroups.userId} as userId
      FROM child
             INNER JOIN ${usersGroups} ON child.id = ${usersGroups.groupId}
    `
    const [r]: { userId: number }[][] = (await this.db.execute(withChildren)) as MySqlQueryResult
    return r.length ? r.map((r) => r.userId) : []
  }

  private async searchGroups(
    searchMembersDto: SearchMembersDto,
    userId?: number,
    limit = 3
  ): Promise<Pick<Group, 'id' | 'name' | 'description' | 'type' | 'permissions'>[]> {
    /* Search for groups */
    const where: SQL[] = [like(groups.name, `%${searchMembersDto.search}%`)]
    if (userId) {
      let idsWhitelist: number[] = await this.groupsWhitelist(userId)
      if (searchMembersDto.ignoreGroupIds?.length) {
        idsWhitelist = idsWhitelist.filter((id) => searchMembersDto.ignoreGroupIds.indexOf(id) === -1)
      }
      where.unshift(inArray(groups.id, idsWhitelist))
    } else if (searchMembersDto.ignoreGroupIds?.length) {
      where.unshift(notInArray(groups.id, searchMembersDto.ignoreGroupIds))
    }
    if (searchMembersDto.excludePersonalGroups) {
      where.unshift(eq(groups.type, GROUP_TYPE.USER))
    }
    return this.db
      .select({ id: groups.id, name: groups.name, description: groups.description, type: groups.type, permissions: groups.permissions })
      .from(groups)
      .where(and(...where))
      .limit(limit)
  }

  private async searchUsers(
    searchMembersDto: SearchMembersDto,
    userId?: number,
    limit = 3
  ): Promise<Pick<UserModel, 'id' | 'login' | 'email' | 'fullName' | 'role' | 'permissions'>[]> {
    /* Search for users */
    const where: SQL[] = [
      ne(users.role, USER_ROLE.LINK),
      or(like(sql`CONCAT_WS('-', ${users.login}, ${users.email}, ${users.firstName}, ${users.lastName})`, `%${searchMembersDto.search}%`))
    ]
    if (userId) {
      let idsWhitelist: number[] = await this.usersWhitelist(userId)
      if (searchMembersDto.ignoreUserIds?.length) {
        idsWhitelist = idsWhitelist.filter((id) => searchMembersDto.ignoreUserIds.indexOf(id) === -1)
      }
      where.unshift(inArray(users.id, idsWhitelist))
    } else {
      if (searchMembersDto.ignoreUserIds?.length) {
        where.unshift(notInArray(users.id, searchMembersDto.ignoreUserIds))
      }
    }
    if (typeof searchMembersDto.usersRole !== 'undefined') {
      if (searchMembersDto.usersRole === USER_ROLE.USER) {
        // allow admin users
        where.unshift(lte(users.role, searchMembersDto.usersRole))
      } else {
        where.unshift(eq(users.role, searchMembersDto.usersRole))
      }
    }
    return this.db
      .select({
        id: users.id,
        login: users.login,
        email: users.email,
        fullName: userFullNameSQL(users),
        role: users.role,
        permissions: users.permissions
      })
      .from(users)
      .where(and(...where))
      .limit(limit)
  }
}
