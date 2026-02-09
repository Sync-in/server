import { Inject, Injectable, Logger } from '@nestjs/common'
import { and, count, countDistinct, eq, inArray, isNotNull, isNull, lte, SelectedFields, SQL, sql } from 'drizzle-orm'
import { alias, union } from 'drizzle-orm/mysql-core'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import { DBSchema } from '../../../infrastructure/database/interfaces/database.interface'
import { concatDistinctObjectsInArray, dateTimeUTC, dbCheckAffectedRows, dbGetInsertedId } from '../../../infrastructure/database/utils'
import { UserMailNotification } from '../../notifications/interfaces/user-mail-notification.interface'
import { GROUP_TYPE } from '../constants/group'
import { MEMBER_TYPE } from '../constants/member'
import { USER_GROUP_ROLE, USER_ROLE, USER_SECRET } from '../constants/user'
import { CreateOrUpdateGroupDto } from '../dto/create-or-update-group.dto'
import type { AdminGroup } from '../interfaces/admin-group.interface'
import type { AdminUser } from '../interfaces/admin-user.interface'
import { Member } from '../interfaces/member.interface'
import type { Group } from '../schemas/group.interface'
import { groups } from '../schemas/groups.schema'
import { UserGroup } from '../schemas/user-group.interface'
import { usersGroups } from '../schemas/users-groups.schema'
import { usersGuests } from '../schemas/users-guests.schema'
import { userFullNameSQL, users } from '../schemas/users.schema'
import { UsersQueries } from './users-queries.service'

@Injectable()
export class AdminUsersQueries {
  private readonly logger = new Logger(AdminUsersQueries.name)

  constructor(
    @Inject(DB_TOKEN_PROVIDER) private readonly db: DBSchema,
    public readonly usersQueries: UsersQueries
  ) {}

  async listUsers(): Promise<AdminUser[]>
  async listUsers(userId: number): Promise<AdminUser>
  async listUsers(userId?: number): Promise<AdminUser | AdminUser[]> {
    const where: SQL[] = [lte(users.role, USER_ROLE.USER), ...(userId ? [eq(users.id, userId)] : [])]
    const q = this.db
      .select({
        id: users.id,
        login: users.login,
        email: users.email,
        role: users.role,
        fullName: userFullNameSQL(users),
        isActive: users.isActive,
        ...(userId && {
          firstName: users.firstName,
          lastName: users.lastName,
          notification: users.notification,
          permissions: users.permissions,
          twoFaEnabled:
            sql<boolean>`JSON_UNQUOTE(JSON_EXTRACT(${users.secrets}, ${sql.raw(`'$.${USER_SECRET.TWO_FA_SECRET}'`)})) IS NOT NULL`.mapWith(Boolean),
          groups: concatDistinctObjectsInArray(groups.id, {
            id: groups.id,
            name: groups.name,
            description: groups.description,
            type: sql.raw(`'${MEMBER_TYPE.GROUP}'`),
            permissions: groups.permissions,
            createdAt: dateTimeUTC(usersGroups.createdAt)
          } satisfies Record<keyof Pick<Member, 'id' | 'name' | 'description' | 'type' | 'permissions' | 'createdAt'>, any>)
        }),
        language: users.language,
        passwordAttempts: users.passwordAttempts,
        storageUsage: users.storageUsage,
        storageQuota: users.storageQuota,
        currentIp: users.currentIp,
        lastIp: users.lastIp,
        currentAccess: users.currentAccess,
        lastAccess: users.lastAccess,
        createdAt: users.createdAt
      } satisfies AdminUser | SelectedFields<any, any>)
      .from(users)
    if (userId) {
      q.leftJoin(usersGroups, eq(usersGroups.userId, users.id))
      q.leftJoin(groups, and(eq(groups.id, usersGroups.groupId), eq(groups.type, GROUP_TYPE.USER)))
      q.limit(1)
    }
    q.where(and(...where)).groupBy(users.id)
    const rs: AdminUser[] = await q
    if (userId) {
      return rs.length ? rs[0] : null
    }
    return rs
  }

  async listAdminsToNotify(): Promise<UserMailNotification[]> {
    return this.db
      .select({ id: users.id, email: users.email, language: users.language, notification: users.notification })
      .from(users)
      .where(eq(users.role, USER_ROLE.ADMINISTRATOR))
  }

  async groupFromId(groupId: number): Promise<AdminGroup> {
    const groupParent = alias(groups, 'groupParent')
    const [group] = await this.db
      .select({
        id: groups.id,
        name: groups.name,
        type: groups.type,
        description: groups.description,
        permissions: groups.permissions,
        visibility: groups.visibility,
        createdAt: groups.createdAt,
        modifiedAt: groups.modifiedAt,
        parent: { id: groupParent.id, name: groupParent.name }
      } satisfies AdminGroup | SelectedFields<any, any>)
      .from(groups)
      .leftJoin(groupParent, eq(groupParent.id, groups.parentId))
      .where(eq(groups.id, groupId))
      .limit(1)
    return group
  }

  async deleteUser(userId: number, userLogin: string): Promise<boolean> {
    return dbCheckAffectedRows(await this.db.delete(users).where(and(eq(users.id, userId), eq(users.login, userLogin))), 1, false)
  }

  async groupFromName(groupName: string): Promise<Pick<Group, 'id' | 'name' | 'type'>> {
    const [group] = await this.db
      .select({
        id: groups.id,
        name: groups.name,
        type: groups.type
      } satisfies Pick<Group, 'id' | 'name' | 'type'> | SelectedFields<any, any>)
      .from(groups)
      .where(eq(groups.name, groupName))
      .limit(1)
    return group
  }

  async browseRootGroupMembers(type: GROUP_TYPE = GROUP_TYPE.USER): Promise<Member[]> {
    const childGroups = alias(groups, 'childGroups')
    return this.db
      .select({
        id: groups.id,
        name: groups.name,
        description: groups.description,
        createdAt: groups.createdAt,
        modifiedAt: groups.modifiedAt,
        type: sql<MEMBER_TYPE>`IF(${groups.type} = ${GROUP_TYPE.USER}, ${MEMBER_TYPE.GROUP}, ${MEMBER_TYPE.PGROUP})`,
        counts: { users: count(usersGroups.userId), groups: countDistinct(childGroups.id) }
      } satisfies Member | SelectedFields<any, any>)
      .from(groups)
      .leftJoin(usersGroups, eq(usersGroups.groupId, groups.id))
      .leftJoin(childGroups, eq(childGroups.parentId, groups.id))
      .where(and(isNull(groups.parentId), eq(groups.type, type)))
      .groupBy(groups.id)
  }

  async browseGroupMembers(groupId: number, type: GROUP_TYPE = GROUP_TYPE.USER): Promise<Member[]> {
    const childGroups = alias(groups, 'childGroups')
    const childGroupMembers = alias(usersGroups, 'childGroupMembers')
    const subChildGroups = alias(groups, 'subChildGroups')
    const userMembers = this.db
      .select({
        id: users.id,
        login: users.login,
        name: userFullNameSQL(users).as('name'),
        description: users.email,
        createdAt: usersGroups.createdAt,
        modifiedAt: sql<Date>`NULL`,
        type: sql<MEMBER_TYPE>`${MEMBER_TYPE.USER}`,
        groupRole: sql<USER_GROUP_ROLE>`${usersGroups.role}`.mapWith(Number),
        counts: { users: sql<number>`0`, groups: sql<number>`0` }
      } satisfies Member | SelectedFields<any, any>)
      .from(groups)
      .innerJoin(usersGroups, eq(usersGroups.groupId, groups.id))
      .leftJoin(users, eq(users.id, usersGroups.userId))
      .where(and(eq(groups.id, groupId), eq(groups.type, type), isNotNull(users.id)))
      .groupBy(users.id)
    if (type === GROUP_TYPE.PERSONAL) {
      return userMembers
    }
    const groupMembers: any = this.db
      .select({
        id: childGroups.id,
        login: sql`NULL`,
        name: childGroups.name,
        description: childGroups.description,
        createdAt: childGroups.createdAt,
        modifiedAt: childGroups.modifiedAt,
        type: sql<MEMBER_TYPE>`${MEMBER_TYPE.GROUP}`,
        groupRole: sql<USER_GROUP_ROLE>`null`,
        counts: { users: count(usersGroups.userId), groups: count(subChildGroups.id) }
      } satisfies Member | SelectedFields<any, any>)
      .from(groups)
      .innerJoin(childGroups, eq(childGroups.parentId, groups.id))
      .leftJoin(usersGroups, eq(usersGroups.groupId, childGroups.id))
      .leftJoin(childGroupMembers, eq(childGroupMembers.groupId, childGroups.id))
      .leftJoin(subChildGroups, eq(subChildGroups.parentId, childGroups.id))
      .where(and(eq(groups.id, groupId), eq(groups.type, type), isNotNull(childGroups.id)))
      .groupBy(childGroups.id)
    return union(userMembers, groupMembers)
  }

  async updateUserGroups(userId: number, groups: { add: number[]; delete: number[] }): Promise<void> {
    if (groups.add.length) {
      try {
        dbCheckAffectedRows(
          await this.db.insert(usersGroups).values(
            groups.add.map((gid: number) => ({
              userId: userId,
              groupId: gid
            }))
          ),
          groups.add.length
        )
        this.logger.log({ tag: this.updateUserGroups.name, msg: `user (${userId}) groups ${JSON.stringify(groups.add)} was added` })
        this.usersQueries.clearWhiteListCaches([userId])
      } catch (e) {
        this.logger.error({ tag: this.updateUserGroups.name, msg: `user (${userId}) groups ${JSON.stringify(groups.add)} was not added: ${e}` })
        throw new Error('User groups was not added')
      }
    }
    if (groups.delete.length) {
      try {
        dbCheckAffectedRows(
          await this.db.delete(usersGroups).where(and(eq(usersGroups.userId, userId), inArray(usersGroups.groupId, groups.delete))),
          groups.delete.length
        )
        this.logger.log({ tag: this.updateUserGroups.name, msg: `user (${userId}) groups ${JSON.stringify(groups.delete)} was deleted` })
        this.usersQueries.clearWhiteListCaches([userId])
      } catch (e) {
        this.logger.error({ tag: this.updateUserGroups.name, msg: `user (${userId}) groups ${JSON.stringify(groups.delete)} was not deleted: ${e}` })
        throw new Error('User groups was not deleted')
      }
    }
  }

  async createGroup(createGroupDto: CreateOrUpdateGroupDto): Promise<Group['id']> {
    return dbGetInsertedId(await this.db.insert(groups).values({ ...createGroupDto, type: GROUP_TYPE.USER } as Group))
  }

  async updateGroup(groupId: number, set: Partial<Record<keyof Group, any>>): Promise<boolean> {
    try {
      dbCheckAffectedRows(await this.db.update(groups).set(set).where(eq(groups.id, groupId)), 1)
      this.logger.log({ tag: this.updateGroup.name, msg: `group (${groupId}) was updated : ${JSON.stringify(set)}` })
      return true
    } catch (e) {
      this.logger.error({ tag: this.updateGroup.name, msg: `group (${groupId}) was not updated : ${JSON.stringify(set)} : ${e}` })
      return false
    }
  }

  async deleteGroup(groupId: number): Promise<boolean> {
    const [parent] = await this.db.select({ id: groups.parentId }).from(groups).where(eq(groups.id, groupId)).limit(1)
    const parentId = parent?.id
    if (parentId) {
      // attach child groups to current parent
      await this.db
        .update(groups)
        .set({ parentId: parentId } as Partial<Group>)
        .where(eq(groups.parentId, groupId))
    }
    return dbCheckAffectedRows(await this.db.delete(groups).where(eq(groups.id, groupId)).limit(1), 1, false)
  }

  async addUsersToGroup(groupId: number, userIds: number[], lowerOrEqualUserRole: USER_ROLE = USER_ROLE.GUEST): Promise<void> {
    const userIdsWithRequiredRole = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.id, userIds), lte(users.role, lowerOrEqualUserRole)))
    userIds = userIdsWithRequiredRole.map((u) => u.id)
    if (userIds.length === 0) {
      throw new Error('No users to add to group')
    }
    try {
      dbCheckAffectedRows(
        await this.db.insert(usersGroups).values(
          userIdsWithRequiredRole.map((u) => ({
            groupId: groupId,
            userId: u.id
          }))
        ),
        userIdsWithRequiredRole.length
      )
      this.logger.log({ tag: this.addUsersToGroup.name, msg: `users (${userIds}) was added to group (${groupId})` })
      this.usersQueries.clearWhiteListCaches(userIds)
    } catch (e) {
      this.logger.error({ tag: this.addUsersToGroup.name, msg: `unable to add users (${userIds}) to group (${groupId}) : ${e}` })
      throw new Error('Unable to add users to group')
    }
  }

  async updateUserFromGroup(groupId: number, userId: number, role: USER_GROUP_ROLE): Promise<void> {
    try {
      dbCheckAffectedRows(
        await this.db
          .update(usersGroups)
          .set({ role: role } as UserGroup)
          .where(and(eq(usersGroups.groupId, groupId), eq(usersGroups.userId, userId)))
          .limit(1),
        1
      )
      this.logger.log({ tag: this.updateUserFromGroup.name, msg: `user (${userId}) was updated on group (${groupId}) as ${USER_GROUP_ROLE[role]}` })
    } catch (e) {
      this.logger.error({
        tag: this.updateUserFromGroup.name,
        msg: `user (${userId}) was not updated on group (${groupId}) as ${USER_GROUP_ROLE[role]} : ${e}`
      })
      throw new Error('Unable to update user from group')
    }
  }

  async removeUserFromGroup(groupId: number, userId: number): Promise<void> {
    try {
      dbCheckAffectedRows(
        await this.db
          .delete(usersGroups)
          .where(and(eq(usersGroups.groupId, groupId), eq(usersGroups.userId, userId)))
          .limit(1),
        1
      )
      this.logger.log({ tag: this.removeUserFromGroup.name, msg: `user (${userId}) was removed from group (${groupId})` })
      this.usersQueries.clearWhiteListCaches([userId])
    } catch (e) {
      this.logger.error({ tag: this.removeUserFromGroup.name, msg: `user (${userId}) or group (${groupId}) does not exist : ${e}` })
      throw new Error('Unable to remove user from group')
    }
  }

  async updateGuestManagers(guestId: number, managers: { add: number[]; delete: number[] }): Promise<void> {
    if (managers.add.length) {
      try {
        dbCheckAffectedRows(
          await this.db.insert(usersGuests).values(
            managers.add.map((uid: number) => ({
              userId: uid,
              guestId: guestId
            }))
          ),
          managers.add.length
        )
        this.logger.log({ tag: this.updateGuestManagers.name, msg: `guest (${guestId}) managers ${JSON.stringify(managers.add)} was added` })
      } catch (e) {
        this.logger.error({
          tag: this.updateGuestManagers.name,
          msg: `guest (${guestId}) managers ${JSON.stringify(managers.add)} was not added: ${e}`
        })
        throw new Error('Guest managers was not added')
      }
    }
    if (managers.delete.length) {
      try {
        dbCheckAffectedRows(
          await this.db.delete(usersGuests).where(and(eq(usersGuests.guestId, guestId), inArray(usersGuests.userId, managers.delete))),
          managers.delete.length
        )
        this.logger.log({ tag: this.updateGuestManagers.name, msg: `guest (${guestId}) managers ${JSON.stringify(managers.delete)} was deleted` })
      } catch (e) {
        this.logger.error({
          tag: this.updateGuestManagers.name,
          msg: `guest (${guestId}) managers ${JSON.stringify(managers.delete)} was not deleted: ${e}`
        })
        throw new Error('Guest managers was not deleted')
      }
    }
  }
}
