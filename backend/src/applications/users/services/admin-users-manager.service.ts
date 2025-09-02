/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { FastifyReply } from 'fastify'
import { LoginResponseDto } from '../../../authentication/dto/login-response.dto'
import { AuthManager } from '../../../authentication/services/auth-manager.service'
import { anonymizePassword, hashPassword } from '../../../common/functions'
import { isPathExists, moveFiles, removeFiles } from '../../files/utils/files'
import { GROUP_TYPE } from '../constants/group'
import { USER_ROLE } from '../constants/user'
import type { CreateOrUpdateGroupDto } from '../dto/create-or-update-group.dto'
import { CreateUserDto, UpdateUserDto, UpdateUserFromGroupDto } from '../dto/create-or-update-user.dto'
import type { AdminDeleteUserDto, DeleteUserDto } from '../dto/delete-user.dto'
import type { SearchMembersDto } from '../dto/search-members.dto'
import type { UserPasswordDto } from '../dto/user-password.dto'
import type { AdminGroup } from '../interfaces/admin-group.interface'
import type { AdminUser } from '../interfaces/admin-user.interface'
import type { GroupBrowse } from '../interfaces/group-browse.interface'
import type { GuestUser } from '../interfaces/guest-user.interface'
import type { Member } from '../interfaces/member.interface'
import { UserModel } from '../models/user.model'
import type { Group } from '../schemas/group.interface'
import type { User } from '../schemas/user.interface'
import { AdminUsersQueries } from './admin-users-queries.service'

@Injectable()
export class AdminUsersManager {
  private readonly logger = new Logger(AdminUsersManager.name)

  constructor(
    private readonly authManager: AuthManager,
    private readonly adminQueries: AdminUsersQueries
  ) {}

  listUsers(): Promise<AdminUser[]> {
    return this.adminQueries.listUsers()
  }

  async getUser(userId: number): Promise<AdminUser> {
    const user: AdminUser = await this.adminQueries.listUsers(userId)
    this.checkUser(user, true)
    return user
  }

  async getGuest(guestId: number): Promise<GuestUser> {
    const user: GuestUser = await this.adminQueries.usersQueries.listGuests(guestId, 0, true)
    this.checkUser(user, true)
    return user
  }

  async createUserOrGuest(createUserDto: CreateUserDto, userRole: USER_ROLE.GUEST, asAdmin: boolean): Promise<GuestUser>
  async createUserOrGuest(createUserDto: CreateUserDto, userRole: USER_ROLE, asAdmin: true): Promise<AdminUser | GuestUser>
  async createUserOrGuest(createUserDto: CreateUserDto, userRole: USER_ROLE, asAdmin?: false): Promise<UserModel>
  async createUserOrGuest(
    createUserDto: CreateUserDto,
    userRole: USER_ROLE = USER_ROLE.USER,
    asAdmin = false
  ): Promise<UserModel | AdminUser | GuestUser> {
    await this.loginOrEmailAlreadyUsed(createUserDto.login, createUserDto.email)
    try {
      createUserDto.password = await hashPassword(createUserDto.password)
      const userId: number = await this.adminQueries.usersQueries.createUserOrGuest(createUserDto, userRole)
      const user = new UserModel({ ...createUserDto, id: userId, role: userRole })
      this.logger.log(
        `${this.createUserOrGuest.name} - ${USER_ROLE[userRole]} (${userId}) was created : ${JSON.stringify(anonymizePassword(createUserDto))}`
      )
      await user.makePaths()
      if (userRole <= USER_ROLE.USER) {
        return asAdmin ? this.getUser(user.id) : user
      } else {
        return asAdmin ? this.getGuest(user.id) : user
      }
    } catch (e) {
      this.logger.error(`${this.createUserOrGuest.name} - unable to create user *${createUserDto.login}* : ${e}`)
      throw new HttpException('Unable to create user', HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  async updateUserOrGuest(userId: number, updateUserDto: UpdateUserDto): Promise<AdminUser>
  async updateUserOrGuest(userId: number, updateUserDto: UpdateUserDto, userRole: USER_ROLE.GUEST): Promise<GuestUser>
  async updateUserOrGuest(
    userId: number,
    updateUserDto: UpdateUserDto,
    userRole: USER_ROLE.USER | USER_ROLE.GUEST = USER_ROLE.USER
  ): Promise<AdminUser | GuestUser> {
    const user: AdminUser & GuestUser = userRole === USER_ROLE.USER ? await this.getUser(userId) : await this.getGuest(userId)
    const updateUser: Partial<User> = {}
    const updateUserGroups: { add: number[]; delete: number[] } = { add: [], delete: [] }
    const updateGuestManagers: { add: number[]; delete: number[] } = { add: [], delete: [] }
    for (const [k, v] of Object.entries(updateUserDto)) {
      switch (k as keyof UpdateUserDto) {
        case 'login':
          if (user.login === v) {
            break
          }
          if (await this.adminQueries.usersQueries.checkUserExists(v)) {
            throw new HttpException('Login already used', HttpStatus.FORBIDDEN)
          }
          if (!(await this.renameUserSpace(user.login, v))) {
            throw new HttpException('Unable to rename user space', HttpStatus.INTERNAL_SERVER_ERROR)
          }
          updateUser.login = v
          break
        case 'email':
          if (user.email === v) {
            break
          }
          if (await this.adminQueries.usersQueries.checkUserExists(null, v)) {
            throw new HttpException('Email already used', HttpStatus.FORBIDDEN)
          }
          updateUser.email = v
          break
        case 'isActive':
          updateUser.isActive = v
          if (v) {
            updateUser.passwordAttempts = 0
          }
          break
        case 'password':
          updateUser.password = await hashPassword(updateUserDto.password)
          break
        case 'groups':
          if (userRole === USER_ROLE.USER) {
            const currentGroups: number[] = user.groups?.length ? user.groups.map((g) => g.id) : []
            updateUserGroups.add = v.filter((id: number) => currentGroups.indexOf(id) === -1)
            updateUserGroups.delete = currentGroups.filter((id: number) => v.indexOf(id) === -1)
          }
          break
        case 'managers':
          if (userRole === USER_ROLE.GUEST) {
            const currentManagers: number[] = user.managers?.length ? user.managers.map((m) => m.id) : []
            updateGuestManagers.add = v.filter((id: number) => currentManagers.indexOf(id) === -1)
            updateGuestManagers.delete = currentManagers.filter((id: number) => v.indexOf(id) === -1)
          }
          break
        default:
          updateUser[k] = v
      }
    }
    if (Object.keys(updateUser).length) {
      // force the type for security reason
      const forceRole = userRole === USER_ROLE.GUEST ? USER_ROLE.GUEST : undefined
      if (!(await this.adminQueries.usersQueries.updateUserOrGuest(user.id, updateUser, forceRole))) {
        throw new HttpException('Unable to update user', HttpStatus.INTERNAL_SERVER_ERROR)
      }
    }
    if (userRole === USER_ROLE.USER) {
      if (updateUserGroups.add.length || updateUserGroups.delete.length) {
        try {
          await this.adminQueries.updateUserGroups(user.id, updateUserGroups)
        } catch {
          throw new HttpException('Unable to update user groups', HttpStatus.INTERNAL_SERVER_ERROR)
        }
      }
      return this.getUser(userId)
    } else {
      if (updateGuestManagers.add.length || updateGuestManagers.delete.length) {
        try {
          await this.adminQueries.updateGuestManagers(user.id, updateGuestManagers)
        } catch {
          throw new HttpException('Unable to update guest managers', HttpStatus.INTERNAL_SERVER_ERROR)
        }
      }
      return this.getGuest(userId)
    }
  }

  async deleteUserOrGuest(userId: number, userLogin: string, deleteUserDto: DeleteUserDto): Promise<void> {
    try {
      if (await this.adminQueries.deleteUser(userId, userLogin)) {
        this.logger.log(`${this.deleteUserOrGuest.name} - *${userLogin}* (${userId}) was deleted`)
      } else {
        this.logger.error(`${this.deleteUserOrGuest.name} - *${userLogin}* (${userId}) was not deleted : not found`)
      }
      if (deleteUserDto.deleteSpace) {
        await this.deleteUserSpace(userLogin, deleteUserDto.isGuest)
      }
    } catch (e) {
      this.logger.error(`${this.deleteUserOrGuest.name} - unable to delete *${userLogin}* (${userId}) : ${e}`)
      throw new HttpException('Unable to delete user', HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  async deleteUserFromAdmin(admin: UserModel, userId: number, adminDeleteUserDto: AdminDeleteUserDto): Promise<void> {
    // check admin password
    if (!(await this.adminQueries.usersQueries.compareUserPassword(admin.id, adminDeleteUserDto.adminPassword))) {
      throw new HttpException('Bad password', HttpStatus.BAD_REQUEST)
    }
    const userToDelete: UserModel = this.checkUser(await this.adminQueries.usersQueries.from(userId))
    await this.deleteUserOrGuest(userToDelete.id, userToDelete.login, {
      deleteSpace: adminDeleteUserDto.deleteSpace
    } satisfies DeleteUserDto)
  }

  listGuests(): Promise<AdminUser[]> {
    return this.adminQueries.usersQueries.listGuests(null, null, true)
  }

  createGuest(user: UserModel, createGuestDto: CreateUserDto): Promise<GuestUser> {
    if (!createGuestDto.managers.length) {
      createGuestDto.managers.push(user.id)
    }
    return this.createUserOrGuest(createGuestDto, USER_ROLE.GUEST, true)
  }

  updateGuest(guestId: number, updateGuestDto: UpdateUserDto): Promise<GuestUser> {
    if (!Object.keys(updateGuestDto).length) {
      throw new HttpException('No changes to update', HttpStatus.BAD_REQUEST)
    }
    if (updateGuestDto.managers && !updateGuestDto.managers.length) {
      throw new HttpException('Guest must have at least one manager', HttpStatus.BAD_REQUEST)
    }
    return this.updateUserOrGuest(guestId, updateGuestDto, USER_ROLE.GUEST)
  }

  async deleteGuest(guestId: number): Promise<void> {
    // guest has no space but a temporary directory
    const guest: GuestUser = await this.getGuest(guestId)
    return this.deleteUserOrGuest(guest.id, guest.login, { deleteSpace: true, isGuest: true })
  }

  async browseGroups(name?: string, type: GROUP_TYPE = GROUP_TYPE.USER): Promise<GroupBrowse> {
    if (name) {
      const group: Pick<Group, 'id' | 'name' | 'type'> = await this.adminQueries.groupFromName(name)
      if (!group) {
        throw new HttpException('Group not found', HttpStatus.NOT_FOUND)
      }
      return { parentGroup: group, members: await this.adminQueries.browseGroupMembers(group.id, type) }
    }
    return { parentGroup: undefined, members: await this.adminQueries.browseRootGroupMembers(type) }
  }

  async getGroup(groupId: number): Promise<AdminGroup> {
    const group = await this.adminQueries.groupFromId(groupId)
    if (!group) {
      throw new HttpException('Group not found', HttpStatus.NOT_FOUND)
    }
    return group
  }

  async createGroup(createGroupDto: CreateOrUpdateGroupDto): Promise<AdminGroup> {
    if (!createGroupDto.name) {
      this.logger.error(`${this.createGroup.name} - missing group name : ${JSON.stringify(createGroupDto)}`)
      throw new HttpException('Group name is missing', HttpStatus.BAD_REQUEST)
    }
    await this.checkGroupNameExists(createGroupDto.name)
    try {
      const groupId: number = await this.adminQueries.createGroup(createGroupDto)
      this.logger.log(`${this.createGroup.name} - group (${groupId}) was created : ${JSON.stringify(createGroupDto)}`)
      return this.adminQueries.groupFromId(groupId)
    } catch (e) {
      this.logger.error(`${this.createGroup.name} - group was not created : ${JSON.stringify(createGroupDto)} : ${e}`)
      throw new HttpException('Unable to create group', HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  async updateGroup(groupId: number, updateGroupDto: CreateOrUpdateGroupDto): Promise<AdminGroup> {
    if (updateGroupDto.name) {
      await this.checkGroupNameExists(updateGroupDto.name)
    }
    if (!(await this.adminQueries.updateGroup(groupId, updateGroupDto))) {
      throw new HttpException('Unable to update group', HttpStatus.INTERNAL_SERVER_ERROR)
    }
    return this.adminQueries.groupFromId(groupId)
  }

  async deleteGroup(groupId: number): Promise<void> {
    if (await this.adminQueries.deleteGroup(groupId)) {
      this.logger.log(`${this.deleteGroup.name} - group (${groupId}) was deleted`)
    } else {
      this.logger.warn(`${this.deleteGroup.name} - group (${groupId}) does not exist`)
      throw new HttpException('Unable to delete group', HttpStatus.BAD_REQUEST)
    }
  }

  async addUsersToGroup(groupId: number, userIds: number[]): Promise<void> {
    const group: AdminGroup = await this.adminQueries.groupFromId(groupId)
    if (!group) {
      throw new HttpException('Group not found', HttpStatus.NOT_FOUND)
    }
    try {
      await this.adminQueries.addUsersToGroup(groupId, userIds, group.type === GROUP_TYPE.USER ? USER_ROLE.USER : undefined)
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST)
    }
  }

  async updateUserFromGroup(groupId: number, userId: number, updateUserFromGroupDto: UpdateUserFromGroupDto): Promise<void> {
    try {
      await this.adminQueries.updateUserFromGroup(groupId, userId, updateUserFromGroupDto.role)
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST)
    }
  }

  async removeUserFromGroup(groupId: number, userId: number): Promise<void> {
    try {
      await this.adminQueries.removeUserFromGroup(groupId, userId)
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST)
    }
  }

  searchMembers(searchMembersDto: SearchMembersDto): Promise<Member[]> {
    return this.adminQueries.usersQueries.searchUsersOrGroups(searchMembersDto)
  }

  async impersonateUser(admin: UserModel, userId: number, adminPassword: UserPasswordDto, res: FastifyReply): Promise<LoginResponseDto> {
    // check admin password
    if (admin.id === userId) {
      throw new HttpException('You are already logged in', HttpStatus.BAD_REQUEST)
    }
    if (!(await this.adminQueries.usersQueries.compareUserPassword(admin.id, adminPassword.password))) {
      throw new HttpException('Bad password', HttpStatus.BAD_REQUEST)
    }
    const user: UserModel = this.checkUser(await this.adminQueries.usersQueries.from(userId))
    user.impersonatedFromId = admin.id
    user.impersonatedClientId = admin.clientId
    return this.authManager.setCookies(user, res)
  }

  async logoutImpersonateUser(user: UserModel, res: FastifyReply): Promise<LoginResponseDto> {
    if (!user.impersonatedFromId) {
      throw new HttpException('You are not allowed to do this action', HttpStatus.FORBIDDEN)
    }
    const admin: UserModel = this.checkUser(await this.adminQueries.usersQueries.from(user.impersonatedFromId))
    if (!admin.isAdmin) {
      throw new HttpException('You are not allowed to do this action', HttpStatus.FORBIDDEN)
    }
    admin.clientId = user.impersonatedClientId
    return this.authManager.setCookies(admin, res)
  }

  async deleteUserSpace(userLogin: string, isGuest = false): Promise<void> {
    const userSpace: string = UserModel.getHomePath(userLogin, isGuest)
    try {
      if (await isPathExists(userSpace)) {
        await removeFiles(userSpace)
        this.logger.log(`${this.deleteUserSpace.name} - user space *${userLogin}* was deleted`)
      } else {
        this.logger.warn(`${this.deleteUserSpace.name} - user space *${userLogin}* does not exist : ${userSpace}`)
      }
    } catch (e) {
      this.logger.warn(`${this.deleteUserSpace.name} - user space *${userLogin}* (${userSpace}) was not deleted : ${e}`)
      throw new HttpException('Unable to delete user space', HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  checkUser(user: User | AdminUser | GuestUser, checkOnly: true): void
  checkUser(user: User | AdminUser | GuestUser, checkOnly?: false): UserModel
  checkUser(user: User | AdminUser | GuestUser, checkOnly = false): UserModel | void {
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND)
    }
    if (!checkOnly) {
      return new UserModel(user, true)
    }
  }

  private async renameUserSpace(oldLogin: string, newLogin: string): Promise<boolean> {
    const currentUserSpace: string = UserModel.getHomePath(oldLogin)
    if (!(await isPathExists(currentUserSpace))) {
      this.logger.warn(`${this.renameUserSpace.name} - user space *${oldLogin}* does not exist : ${currentUserSpace}`)
      return false
    }
    const newUserSpace: string = UserModel.getHomePath(newLogin)
    if (await isPathExists(newUserSpace)) {
      this.logger.warn(`${this.renameUserSpace.name} - user space *${newLogin}* already exists : ${newUserSpace}`)
      return false
    }
    try {
      await moveFiles(currentUserSpace, newUserSpace)
      return true
    } catch (e) {
      // try to restore
      await moveFiles(newUserSpace, currentUserSpace, true)
      this.logger.error(`${this.renameUserSpace.name} - unable to rename user space from *${currentUserSpace}* to *${newUserSpace}* : ${e}`)
      return false
    }
  }

  private async checkGroupNameExists(groupName: string): Promise<void> {
    if (await this.adminQueries.usersQueries.checkGroupNameExists(groupName)) {
      throw new HttpException('Name already used', HttpStatus.BAD_REQUEST)
    }
  }

  private async loginOrEmailAlreadyUsed(login: string, email: string) {
    const exists = await this.adminQueries.usersQueries.checkUserExists(login, email)
    if (exists) {
      throw new HttpException(`${exists.login === login ? 'Login' : 'Email'} already used`, HttpStatus.BAD_REQUEST)
    }
  }
}
