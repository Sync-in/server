/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { MultipartFile } from '@fastify/multipart'
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import bcrypt from 'bcryptjs'
import { PNGStream } from 'canvas'
import { WriteStream } from 'fs'
import { createWriteStream } from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { FastifyAuthenticatedRequest } from '../../../authentication/interfaces/auth-request.interface'
import { JwtIdentityPayload } from '../../../authentication/interfaces/jwt-payload.interface'
import { comparePassword } from '../../../common/functions'
import { convertImageToBase64, generateAvatar, pngMimeType, svgMimeType } from '../../../common/image'
import { STATIC_ASSETS_PATH } from '../../../configuration/config.constants'
import { isPathExists, moveFiles } from '../../files/utils/files'
import { MEMBER_TYPE } from '../constants/member'
import { USER_GROUP_ROLE, USER_MAX_PASSWORD_ATTEMPTS, USER_ONLINE_STATUS, USER_ROLE } from '../constants/user'
import { UserCreateOrUpdateGroupDto } from '../dto/create-or-update-group.dto'
import { CreateUserDto, UpdateUserDto, UpdateUserFromGroupDto } from '../dto/create-or-update-user.dto'
import { SearchMembersDto } from '../dto/search-members.dto'
import { UserLanguageDto, UserNotificationDto, UserPasswordDto } from '../dto/user-properties.dto'
import type { GroupBrowse } from '../interfaces/group-browse.interface'
import type { GroupMember, GroupWithMembers } from '../interfaces/group-member'
import type { GuestUser } from '../interfaces/guest-user.interface'
import type { Member } from '../interfaces/member.interface'
import type { UserOnline } from '../interfaces/websocket.interface'
import { UserModel } from '../models/user.model'
import type { Group } from '../schemas/group.interface'
import type { UserGroup } from '../schemas/user-group.interface'
import type { User } from '../schemas/user.interface'
import { AdminUsersManager } from './admin-users-manager.service'
import { UsersQueries } from './users-queries.service'

@Injectable()
export class UsersManager {
  private readonly defaultAvatarFilePath = path.join(STATIC_ASSETS_PATH, 'avatar.svg')
  private readonly userAvatarFileName = 'avatar.png'
  private readonly maxAvatarUploadSize = 1024 * 1024 * 5
  private readonly logger = new Logger(UsersManager.name)

  constructor(
    private readonly usersQueries: UsersQueries,
    private readonly adminUsersManager: AdminUsersManager
  ) {}

  async fromUserId(id: number): Promise<UserModel> {
    const user: User = await this.usersQueries.from(id)
    return user ? new UserModel(user, true) : null
  }

  async findUser(loginOrEmail: string, removePassword: false): Promise<UserModel>
  async findUser(loginOrEmail: string, removePassword?: true): Promise<Omit<UserModel, 'password'>>
  async findUser(loginOrEmail: string, removePassword: boolean = true): Promise<Omit<UserModel, 'password'>> {
    const user: User = await this.usersQueries.from(null, loginOrEmail)
    return user ? new UserModel(user, removePassword) : null
  }

  async logUser(user: UserModel, password: string, ip: string): Promise<UserModel> {
    if (user.role === USER_ROLE.LINK) {
      this.logger.error(`${this.logUser.name} - guest link account ${user} is not authorized to login`)
      throw new HttpException('Account is not allowed', HttpStatus.FORBIDDEN)
    }
    if (!user.isActive || user.passwordAttempts >= USER_MAX_PASSWORD_ATTEMPTS) {
      this.updateAccesses(user, ip, false).catch((e: Error) => this.logger.error(`${this.logUser.name} - ${e}`))
      this.logger.error(`${this.logUser.name} - user account *${user.login}* is locked`)
      throw new HttpException('Account locked', HttpStatus.FORBIDDEN)
    }
    const authSuccess: boolean = await comparePassword(password, user.password)
    this.updateAccesses(user, ip, authSuccess).catch((e: Error) => this.logger.error(`${this.logUser.name} - ${e}`))
    if (authSuccess) {
      await user.makePaths()
      return user
    }
    this.logger.warn(`${this.logUser.name} - bad password for *${user.login}*`)
    return null
  }

  async me(authUser: UserModel): Promise<{ user: Omit<UserModel, 'password'> }> {
    const user = await this.fromUserId(authUser.id)
    if (!user) {
      throw new HttpException(`User *${authUser.login} (${authUser.id}) not found`, HttpStatus.NOT_FOUND)
    }
    user.impersonated = !!authUser.impersonatedFromId
    user.clientId = authUser.clientId
    return { user: user }
  }

  async compareUserPassword(userId: number, password: string): Promise<boolean> {
    return this.usersQueries.compareUserPassword(userId, password)
  }

  async updateLanguage(user: UserModel, userLanguageDto: UserLanguageDto) {
    if (!userLanguageDto.language) userLanguageDto.language = null
    if (!(await this.usersQueries.updateUserOrGuest(user.id, userLanguageDto))) {
      throw new HttpException('Unable to update language', HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  async updatePassword(user: UserModel, userPasswordDto: UserPasswordDto) {
    const r = await this.usersQueries.selectUserProperties(user.id, ['password'])
    if (!r) {
      throw new HttpException('Unable to check password', HttpStatus.NOT_FOUND)
    }
    if (!(await comparePassword(userPasswordDto.oldPassword, r.password))) {
      throw new HttpException('Password mismatch', HttpStatus.BAD_REQUEST)
    }
    const hash = await bcrypt.hash(userPasswordDto.newPassword, 10)
    if (!(await this.usersQueries.updateUserOrGuest(user.id, { password: hash }))) {
      throw new HttpException('Unable to update password', HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  async updateNotification(user: UserModel, userNotificationDto: UserNotificationDto) {
    if (!(await this.usersQueries.updateUserOrGuest(user.id, userNotificationDto))) {
      throw new HttpException('Unable to update notification', HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  async updateAvatar(req: FastifyAuthenticatedRequest) {
    const part: MultipartFile = await req.file({ limits: { fileSize: this.maxAvatarUploadSize } })
    if (!part.mimetype.startsWith('image/')) {
      throw new HttpException('Unsupported file type', HttpStatus.BAD_REQUEST)
    }
    const dstPath = path.join(req.user.tmpPath, this.userAvatarFileName)
    try {
      await pipeline(part.file, createWriteStream(dstPath))
    } catch (e) {
      this.logger.error(`${this.updateAvatar.name} - ${e}`)
      throw new HttpException('Unable to upload avatar', HttpStatus.INTERNAL_SERVER_ERROR)
    }
    if (part.file.truncated) {
      this.logger.warn(`${this.updateAvatar.name} - image is too large`)
      throw new HttpException('Image is too large (5MB max)', HttpStatus.PAYLOAD_TOO_LARGE)
    }
    try {
      await moveFiles(dstPath, path.join(req.user.homePath, this.userAvatarFileName), true)
    } catch (e) {
      this.logger.error(`${this.updateAvatar.name} - ${e}`)
      throw new HttpException('Unable to create avatar', HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  async updateAccesses(user: UserModel, ip: string, success: boolean) {
    const passwordAttempts = success ? 0 : Math.min(user.passwordAttempts + 1, USER_MAX_PASSWORD_ATTEMPTS)
    await this.usersQueries.updateUserOrGuest(user.id, {
      lastAccess: user.currentAccess,
      currentAccess: new Date(),
      lastIp: user.currentIp,
      currentIp: ip,
      passwordAttempts: passwordAttempts,
      isActive: user.isActive && passwordAttempts < USER_MAX_PASSWORD_ATTEMPTS
    })
  }

  async getAvatar(userLogin: string, generate: true, generateIsNotExists?: boolean): Promise<undefined>
  async getAvatar(userLogin: string, generate?: false, generateIsNotExists?: boolean): Promise<[path: string, mime: string]>
  async getAvatar(userLogin: string, generate: boolean = false, generateIsNotExists?: boolean): Promise<[path: string, mime: string]> {
    const avatarPath = path.join(UserModel.getHomePath(userLogin), this.userAvatarFileName)
    const avatarExists = await isPathExists(avatarPath)
    if (!avatarExists && generateIsNotExists) {
      generate = true
    }
    if (!generate) {
      return [avatarExists ? avatarPath : this.defaultAvatarFilePath, avatarExists ? pngMimeType : svgMimeType]
    }
    if (!(await isPathExists(UserModel.getHomePath(userLogin)))) {
      throw new HttpException(`Home path for user *${userLogin}* does not exist`, HttpStatus.FORBIDDEN)
    }
    const user: Partial<UserModel> = await this.findUser(userLogin)
    if (!user) {
      throw new HttpException(`avatar not found`, HttpStatus.NOT_FOUND)
    }
    const avatarFile: WriteStream = createWriteStream(avatarPath)
    const avatarStream: PNGStream = generateAvatar(user.getInitials())
    try {
      await pipeline(avatarStream, avatarFile)
    } catch (e) {
      this.logger.error(`${this.updateAvatar.name} - ${e}`)
      throw new HttpException('Unable to create avatar', HttpStatus.INTERNAL_SERVER_ERROR)
    }
    if (generateIsNotExists) {
      return [avatarPath, pngMimeType]
    }
  }

  async getAvatarBase64(userLogin: string): Promise<string> {
    const userAvatarPath = path.join(UserModel.getHomePath(userLogin), this.userAvatarFileName)
    return convertImageToBase64((await isPathExists(userAvatarPath)) ? userAvatarPath : this.defaultAvatarFilePath)
  }

  setOnlineStatus(user: JwtIdentityPayload, onlineStatus: USER_ONLINE_STATUS) {
    this.usersQueries.setOnlineStatus(user.id, onlineStatus).catch((e: Error) => this.logger.error(`${this.setOnlineStatus.name} - ${e}`))
  }

  getOnlineUsers(userIds: number[]): Promise<UserOnline[]> {
    return this.usersQueries.getOnlineUsers(userIds)
  }

  async usersWhitelist(userId: number): Promise<number[]> {
    return this.usersQueries.usersWhitelist(userId)
  }

  async browseGroups(user: UserModel, name: string): Promise<GroupBrowse> {
    if (name) {
      const group: Pick<Group, 'id' | 'name' | 'type'> & { role: UserGroup['role'] } = await this.usersQueries.groupFromName(user.id, name)
      if (!group) {
        throw new HttpException('Group not found', HttpStatus.NOT_FOUND)
      }
      return { parentGroup: group, members: await this.usersQueries.browseGroupMembers(group.id) }
    }
    return { parentGroup: undefined, members: await this.usersQueries.browseRootGroups(user.id) }
  }

  async getGroup(user: UserModel, groupId: number, withMembers?: true, asAdmin?: boolean): Promise<GroupWithMembers>
  async getGroup(user: UserModel, groupId: number, withMembers: false, asAdmin?: boolean): Promise<GroupMember>
  async getGroup(user: UserModel, groupId: number, withMembers = true, asAdmin = false): Promise<GroupMember | GroupWithMembers> {
    const group = withMembers
      ? await this.usersQueries.getGroupWithMembers(user.id, groupId, asAdmin)
      : await this.usersQueries.getGroup(user.id, groupId, asAdmin)
    if (!group) {
      throw new HttpException('You are not allowed to do this action', HttpStatus.FORBIDDEN)
    }
    return group
  }

  async createPersonalGroup(user: UserModel, userCreateOrUpdateGroupDto: UserCreateOrUpdateGroupDto): Promise<GroupMember> {
    if (!userCreateOrUpdateGroupDto.name) {
      this.logger.error(`${this.createPersonalGroup.name} - missing group name : ${JSON.stringify(userCreateOrUpdateGroupDto)}`)
      throw new HttpException('Group name is missing', HttpStatus.BAD_REQUEST)
    }
    if (await this.usersQueries.checkGroupNameExists(userCreateOrUpdateGroupDto.name)) {
      throw new HttpException('Name already used', HttpStatus.BAD_REQUEST)
    }
    try {
      const groupId: number = await this.usersQueries.createPersonalGroup(user.id, userCreateOrUpdateGroupDto)
      this.logger.log(`${this.createPersonalGroup.name} - group (${groupId}) was created : ${JSON.stringify(userCreateOrUpdateGroupDto)}`)
      // clear user whitelists
      this.usersQueries.clearWhiteListCaches([user.id])
      return this.getGroup(user, groupId, false)
    } catch (e) {
      this.logger.error(`${this.createPersonalGroup.name} - group was not created : ${JSON.stringify(userCreateOrUpdateGroupDto)} : ${e}`)
      throw new HttpException('Unable to create group', HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  async updatePersonalGroup(user: UserModel, groupId: number, userCreateOrUpdateGroupDto: UserCreateOrUpdateGroupDto): Promise<GroupMember> {
    if (!Object.keys(userCreateOrUpdateGroupDto).length) {
      throw new HttpException('No changes to update', HttpStatus.BAD_REQUEST)
    }
    const currentGroup: GroupMember = await this.getGroup(user, groupId, false, user.isAdmin)
    if (currentGroup.type !== MEMBER_TYPE.PGROUP) {
      throw new HttpException('You are not allowed to do this action', HttpStatus.FORBIDDEN)
    }
    if (userCreateOrUpdateGroupDto.name && (await this.usersQueries.checkGroupNameExists(userCreateOrUpdateGroupDto.name))) {
      throw new HttpException('Name already used', HttpStatus.BAD_REQUEST)
    }
    try {
      await this.usersQueries.updateGroup(groupId, userCreateOrUpdateGroupDto)
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.INTERNAL_SERVER_ERROR)
    }
    return this.getGroup(user, groupId, false, user.isAdmin)
  }

  async addUsersToGroup(user: UserModel, groupId: number, userIds: number[]): Promise<void> {
    const currentGroup: GroupWithMembers = await this.getGroup(user, groupId)
    // only users can be added to users groups
    // guests and users can be added to personal groups
    const userWhiteList: number[] = await this.usersQueries.usersWhitelist(
      user.id,
      currentGroup.type === MEMBER_TYPE.GROUP ? USER_ROLE.USER : undefined
    )
    // ignore user ids that are already group members & filter on user ids allowed to current user
    userIds = userIds.filter((id) => !currentGroup.members.find((m) => m.id === id)).filter((id) => userWhiteList.indexOf(id) > -1)
    if (!userIds.length) {
      throw new HttpException('No users to add to group', HttpStatus.BAD_REQUEST)
    }
    return this.usersQueries.updateGroupMembers(groupId, { add: userIds.map((id) => ({ id: id, groupRole: USER_GROUP_ROLE.MEMBER })) })
  }

  async updateUserFromPersonalGroup(user: UserModel, groupId: number, userId: number, updateUserFromGroupDto: UpdateUserFromGroupDto): Promise<void> {
    const currentGroup: GroupWithMembers = await this.getGroup(user, groupId)
    if (currentGroup.type !== MEMBER_TYPE.PGROUP) {
      throw new HttpException('You are not allowed to do this action', HttpStatus.FORBIDDEN)
    }
    const userToUpdate = currentGroup.members.find((m) => m.id === userId)
    if (!userToUpdate) {
      throw new HttpException('User was not found', HttpStatus.BAD_REQUEST)
    }
    if (userToUpdate.groupRole !== updateUserFromGroupDto.role) {
      if (userToUpdate.groupRole === USER_GROUP_ROLE.MANAGER) {
        if (currentGroup.members.filter((m) => m.groupRole === USER_GROUP_ROLE.MANAGER).length === 1) {
          throw new HttpException('Group must have at least one manager', HttpStatus.BAD_REQUEST)
        }
      }
      return this.adminUsersManager.updateUserFromGroup(groupId, userId, updateUserFromGroupDto)
    }
  }

  async removeUserFromGroup(user: UserModel, groupId: number, userId: number): Promise<void> {
    const currentGroup: GroupWithMembers = await this.getGroup(user, groupId)
    const userToRemove = currentGroup.members.find((m) => m.id === userId)
    if (!userToRemove) {
      throw new HttpException('User was not found', HttpStatus.BAD_REQUEST)
    }
    if (userToRemove.groupRole === USER_GROUP_ROLE.MANAGER) {
      if (currentGroup.type === MEMBER_TYPE.GROUP) {
        throw new HttpException('You are not allowed to do this action', HttpStatus.FORBIDDEN)
      }
      if (currentGroup.members.filter((m) => m.groupRole === USER_GROUP_ROLE.MANAGER).length === 1) {
        throw new HttpException('Group must have at least one manager', HttpStatus.BAD_REQUEST)
      }
    }
    return this.usersQueries.updateGroupMembers(groupId, { remove: [userId] })
  }

  async leavePersonalGroup(user: UserModel, groupId: number): Promise<void> {
    const currentGroup: GroupWithMembers = await this.usersQueries.getGroupWithMembers(user.id, groupId, true)
    if (!currentGroup || currentGroup.type === MEMBER_TYPE.GROUP || !currentGroup.members.find((m) => m.id === user.id)) {
      throw new HttpException('You are not allowed to do this action', HttpStatus.FORBIDDEN)
    }
    const userWhoLeaves = currentGroup.members.find((m) => m.id === user.id)
    if (!userWhoLeaves) {
      throw new HttpException('User was not found', HttpStatus.BAD_REQUEST)
    }
    if (userWhoLeaves.groupRole === USER_GROUP_ROLE.MANAGER) {
      if (currentGroup.members.filter((m) => m.groupRole === USER_GROUP_ROLE.MANAGER).length === 1) {
        throw new HttpException('Group must have at least one manager', HttpStatus.BAD_REQUEST)
      }
    }
    try {
      await this.usersQueries.updateGroupMembers(groupId, { remove: [user.id] })
      this.logger.log(`${this.leavePersonalGroup.name} - user (${user.id}) has left group (${groupId})`)
    } catch (e) {
      this.logger.error(`${this.leavePersonalGroup.name} - user (${user.id}) has not left group (${groupId}) : ${e}`)
      throw new HttpException(e.message, HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  async deletePersonalGroup(user: UserModel, groupId: number): Promise<void> {
    if (!(await this.usersQueries.canDeletePersonalGroup(user.id, groupId))) {
      throw new HttpException('You are not allowed to do this action', HttpStatus.FORBIDDEN)
    }
    if (await this.usersQueries.deletePersonalGroup(groupId)) {
      this.logger.log(`${this.deletePersonalGroup.name} - group (${groupId}) was deleted`)
    } else {
      this.logger.warn(`${this.deletePersonalGroup.name} - group (${groupId}) does not exist`)
      throw new HttpException('Unable to delete group', HttpStatus.BAD_REQUEST)
    }
  }

  listGuests(user: UserModel): Promise<GuestUser[]> {
    return this.usersQueries.listGuests(null, user.id)
  }

  async getGuest(user: UserModel, guestId: number): Promise<GuestUser> {
    const guest: GuestUser = await this.usersQueries.listGuests(guestId, user.id)
    this.adminUsersManager.checkUser(guest, true)
    return guest
  }

  async createGuest(user: UserModel, createGuestDto: CreateUserDto): Promise<GuestUser> {
    // filter managers that are allowed for current user
    const userWhiteList = await this.usersQueries.usersWhitelist(user.id, USER_ROLE.USER)
    createGuestDto.managers = createGuestDto.managers.filter((id) => userWhiteList.indexOf(id) > -1)
    if (createGuestDto.managers.indexOf(user.id) === -1) {
      // force user as manager during creation
      createGuestDto.managers.push(user.id)
    }
    // clear user whitelists
    this.usersQueries.clearWhiteListCaches([user.id])
    return this.adminUsersManager.createUserOrGuest(createGuestDto, USER_ROLE.GUEST, true)
  }

  async updateGuest(user: UserModel, guestId: number, updateGuestDto: UpdateUserDto): Promise<GuestUser> {
    if (!Object.keys(updateGuestDto).length) {
      throw new HttpException('No changes to update', HttpStatus.BAD_REQUEST)
    }
    if (updateGuestDto.managers) {
      // filter managers that are allowed for current user
      const userWhiteList = await this.usersQueries.usersWhitelist(user.id, USER_ROLE.USER)
      updateGuestDto.managers = updateGuestDto.managers.filter((id) => userWhiteList.indexOf(id) > -1)
      if (!updateGuestDto.managers.length) {
        throw new HttpException('Guest must have at least one manager', HttpStatus.BAD_REQUEST)
      }
    }
    if (!(await this.usersQueries.isGuestManager(user.id, guestId))) {
      throw new HttpException('You are not allowed to do this action', HttpStatus.FORBIDDEN)
    }
    const guest = await this.adminUsersManager.updateUserOrGuest(guestId, updateGuestDto, USER_ROLE.GUEST)
    return guest.managers.find((m) => m.id === user.id) ? guest : null
  }

  async deleteGuest(user: UserModel, guestId: number): Promise<void> {
    const guest = await this.usersQueries.isGuestManager(user.id, guestId)
    if (!guest) {
      throw new HttpException('You are not allowed to do this action', HttpStatus.FORBIDDEN)
    }
    // guest has no space but a temporary directory
    return this.adminUsersManager.deleteUserOrGuest(guest.id, guest.login, { deleteSpace: true, isGuest: true })
  }

  searchMembers(user: UserModel, searchMembersDto: SearchMembersDto): Promise<Member[]> {
    return this.usersQueries.searchUsersOrGroups(searchMembersDto, user.id)
  }
}
