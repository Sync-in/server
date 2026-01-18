/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Body, Controller, Delete, Get, Header, Param, ParseIntPipe, Patch, Post, Put, Req, Search, StreamableFile, UseGuards } from '@nestjs/common'
import { createReadStream } from 'fs'
import { LoginResponseDto } from '../../authentication/dto/login-response.dto'
import { FastifyAuthenticatedRequest } from '../../authentication/interfaces/auth-request.interface'
import { AuthTwoFaGuardWithoutPassword } from '../../authentication/providers/two-fa/auth-two-fa-guard'
import { makeContentDispositionAttachment } from '../files/utils/send-file'
import { USERS_ROUTE } from './constants/routes'
import { USER_PERMISSION, USER_ROLE } from './constants/user'
import { UserHavePermission } from './decorators/permissions.decorator'
import { UserHaveRole } from './decorators/roles.decorator'
import { GetUser } from './decorators/user.decorator'
import { UserCreateOrUpdateGroupDto } from './dto/create-or-update-group.dto'
import { CreateUserDto, UpdateUserDto, UpdateUserFromGroupDto } from './dto/create-or-update-user.dto'
import { SearchMembersDto } from './dto/search-members.dto'
import { UserAppPasswordDto, UserLanguageDto, UserNotificationDto, UserStorageIndexingDto, UserUpdatePasswordDto } from './dto/user-properties.dto'
import { UserPermissionsGuard } from './guards/permissions.guard'
import { UserRolesGuard } from './guards/roles.guard'
import { GroupBrowse } from './interfaces/group-browse.interface'
import { GroupMember } from './interfaces/group-member'
import { GuestUser } from './interfaces/guest-user.interface'
import { Member } from './interfaces/member.interface'
import { UserAppPassword } from './interfaces/user-secrets.interface'
import { UserModel } from './models/user.model'
import { UsersManager } from './services/users-manager.service'
import { USER_AVATAR_FILE_NAME } from './utils/avatar'

@Controller(USERS_ROUTE.BASE)
@UseGuards(UserRolesGuard)
@UserHaveRole(USER_ROLE.USER)
export class UsersController {
  constructor(private readonly usersManager: UsersManager) {}

  @Get(USERS_ROUTE.ME)
  @UserHaveRole(USER_ROLE.LINK)
  me(@GetUser() user: UserModel): Promise<Omit<LoginResponseDto, 'token'>> {
    return this.usersManager.me(user)
  }

  @Get(`${USERS_ROUTE.ME}/${USERS_ROUTE.APP_PASSWORDS}`)
  @UserHaveRole(USER_ROLE.USER)
  @UseGuards(AuthTwoFaGuardWithoutPassword)
  listAppPasswords(@GetUser() user: UserModel): Promise<Omit<UserAppPassword, 'password'>[]> {
    return this.usersManager.listAppPasswords(user)
  }

  @Post(`${USERS_ROUTE.ME}/${USERS_ROUTE.APP_PASSWORDS}`)
  @UserHaveRole(USER_ROLE.USER)
  @UseGuards(AuthTwoFaGuardWithoutPassword)
  generateAppPassword(@GetUser() user: UserModel, @Body() userAppPasswordDto: UserAppPasswordDto): Promise<UserAppPassword> {
    return this.usersManager.generateAppPassword(user, userAppPasswordDto)
  }

  @Delete(`${USERS_ROUTE.ME}/${USERS_ROUTE.APP_PASSWORDS}/:name`)
  @UserHaveRole(USER_ROLE.USER)
  deleteAppPassword(@GetUser() user: UserModel, @Param('name') name: string): Promise<void> {
    return this.usersManager.deleteAppPassword(user, name)
  }

  @Put(`${USERS_ROUTE.ME}/${USERS_ROUTE.LANGUAGE}`)
  @UserHaveRole(USER_ROLE.GUEST)
  updateLanguage(@GetUser() user: UserModel, @Body() userLanguageDto: UserLanguageDto) {
    return this.usersManager.updateLanguage(user, userLanguageDto)
  }

  @Put(`${USERS_ROUTE.ME}/${USERS_ROUTE.PASSWORD}`)
  @UseGuards(AuthTwoFaGuardWithoutPassword)
  updatePassword(@GetUser() user: UserModel, @Body() userPasswordDto: UserUpdatePasswordDto) {
    return this.usersManager.updatePassword(user, userPasswordDto)
  }

  @Put(`${USERS_ROUTE.ME}/${USERS_ROUTE.NOTIFICATION}`)
  @UserHaveRole(USER_ROLE.GUEST)
  updateNotification(@GetUser() user: UserModel, @Body() userNotificationDto: UserNotificationDto) {
    return this.usersManager.updateNotification(user, userNotificationDto)
  }

  @Put(`${USERS_ROUTE.ME}/${USERS_ROUTE.STORAGE_INDEXING}`)
  @UserHaveRole(USER_ROLE.USER)
  updateStorageIndexing(@GetUser() user: UserModel, @Body() userStorageIndexingDto: UserStorageIndexingDto) {
    return this.usersManager.updateStorageIndexing(user, userStorageIndexingDto)
  }

  @Get(`${USERS_ROUTE.AVATAR}/:login`)
  @UserHaveRole(USER_ROLE.LINK)
  @Header('cache-control', 'public,max-age=86400')
  async avatar(@GetUser() user: UserModel, @Param('login') login: 'me' | string): Promise<StreamableFile> {
    const isMe: boolean = login === 'me'
    const [path, mime] = await this.usersManager.getAvatar(isMe ? user.login : login, false, isMe && user.role <= USER_ROLE.USER)
    return new StreamableFile(createReadStream(path), { type: mime, disposition: makeContentDispositionAttachment(USER_AVATAR_FILE_NAME) })
  }

  @Put(`${USERS_ROUTE.ME}/${USERS_ROUTE.AVATAR}`)
  updateAvatar(@Req() req: FastifyAuthenticatedRequest) {
    return this.usersManager.updateAvatar(req)
  }

  @Patch(`${USERS_ROUTE.ME}/${USERS_ROUTE.AVATAR}`)
  genAvatar(@GetUser() user: UserModel) {
    return this.usersManager.getAvatar(user.login, true)
  }

  @Search()
  searchMembers(@GetUser() user: UserModel, @Body() searchMembersDto: SearchMembersDto): Promise<Member[]> {
    return this.usersManager.searchMembers(user, searchMembersDto)
  }

  @Get(`${USERS_ROUTE.ME}/${USERS_ROUTE.GROUPS}/${USERS_ROUTE.BROWSE}/:name?`)
  browseGroups(@GetUser() user: UserModel, @Param('name') name?: string): Promise<GroupBrowse> {
    return this.usersManager.browseGroups(user, name)
  }

  @Post(`${USERS_ROUTE.ME}/${USERS_ROUTE.GROUPS}`)
  @UserHavePermission(USER_PERMISSION.PERSONAL_GROUPS_ADMIN)
  @UseGuards(UserPermissionsGuard)
  createPersonalGroup(@GetUser() user: UserModel, @Body() userCreateOrUpdateGroupDto: UserCreateOrUpdateGroupDto): Promise<GroupMember> {
    return this.usersManager.createPersonalGroup(user, userCreateOrUpdateGroupDto)
  }

  @Put(`${USERS_ROUTE.ME}/${USERS_ROUTE.GROUPS}/:id`)
  updatePersonalGroup(
    @GetUser() user: UserModel,
    @Param('id', ParseIntPipe) groupId: number,
    @Body() userCreateOrUpdateGroupDto: UserCreateOrUpdateGroupDto
  ): Promise<GroupMember> {
    return this.usersManager.updatePersonalGroup(user, groupId, userCreateOrUpdateGroupDto)
  }

  @Delete(`${USERS_ROUTE.ME}/${USERS_ROUTE.GROUPS}/:id`)
  deletePersonalGroup(@GetUser() user: UserModel, @Param('id', ParseIntPipe) groupId: number): Promise<void> {
    return this.usersManager.deletePersonalGroup(user, groupId)
  }

  @Delete(`${USERS_ROUTE.ME}/${USERS_ROUTE.GROUPS}/${USERS_ROUTE.GROUPS_LEAVE}/:id`)
  leavePersonalGroup(@GetUser() user: UserModel, @Param('id', ParseIntPipe) groupId: number): Promise<void> {
    return this.usersManager.leavePersonalGroup(user, groupId)
  }

  @Patch(`${USERS_ROUTE.ME}/${USERS_ROUTE.GROUPS}/:groupId/${USERS_ROUTE.USERS}`)
  addUsersToGroup(@GetUser() user: UserModel, @Param('groupId', ParseIntPipe) groupId: number, @Body() userIds: number[]): Promise<void> {
    return this.usersManager.addUsersToGroup(user, groupId, userIds)
  }

  @Delete(`${USERS_ROUTE.ME}/${USERS_ROUTE.GROUPS}/:groupId/${USERS_ROUTE.USERS}/:userId`)
  removeUserFromGroup(
    @GetUser() user: UserModel,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Param('userId', ParseIntPipe) userId: number
  ): Promise<void> {
    return this.usersManager.removeUserFromGroup(user, groupId, userId)
  }

  @Patch(`${USERS_ROUTE.ME}/${USERS_ROUTE.GROUPS}/:groupId/${USERS_ROUTE.USERS}/:userId`)
  updateUserFromPersonalGroup(
    @GetUser() user: UserModel,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() updateUserFromGroupDto: UpdateUserFromGroupDto
  ): Promise<void> {
    return this.usersManager.updateUserFromPersonalGroup(user, groupId, userId, updateUserFromGroupDto)
  }

  @Get(`${USERS_ROUTE.ME}/${USERS_ROUTE.GUESTS}`)
  listGuests(@GetUser() user: UserModel): Promise<GuestUser[]> {
    return this.usersManager.listGuests(user)
  }

  @Get(`${USERS_ROUTE.ME}/${USERS_ROUTE.GUESTS}/:id`)
  getGuest(@GetUser() user: UserModel, @Param('id', ParseIntPipe) guestId: number): Promise<GuestUser> {
    return this.usersManager.getGuest(user, guestId)
  }

  @Post(`${USERS_ROUTE.ME}/${USERS_ROUTE.GUESTS}`)
  @UserHavePermission(USER_PERMISSION.GUESTS_ADMIN)
  @UseGuards(UserPermissionsGuard)
  createGuest(@GetUser() user: UserModel, @Body() createGuestDto: CreateUserDto): Promise<GuestUser> {
    return this.usersManager.createGuest(user, createGuestDto)
  }

  @Put(`${USERS_ROUTE.ME}/${USERS_ROUTE.GUESTS}/:id`)
  updateGuest(@GetUser() user: UserModel, @Param('id', ParseIntPipe) guestId: number, @Body() updateGuestDto: UpdateUserDto): Promise<GuestUser> {
    return this.usersManager.updateGuest(user, guestId, updateGuestDto)
  }

  @Delete(`${USERS_ROUTE.ME}/${USERS_ROUTE.GUESTS}/:id`)
  deleteGuest(@GetUser() user: UserModel, @Param('id', ParseIntPipe) guestId: number): Promise<void> {
    return this.usersManager.deleteGuest(user, guestId)
  }
}
