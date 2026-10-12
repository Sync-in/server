import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Put, Req, Search, StreamableFile, UseGuards } from '@nestjs/common'
import { createReadStream } from 'fs'
import { LoginResponseDto } from '../../authentication/dto/login-response.dto.js'
import { type FastifyAuthenticatedRequest } from '../../authentication/interfaces/auth-request.interface.js'
import {
  AuthTwoFaVerificationOrPasswordGuard,
  AuthTwoFaVerificationWithoutPasswordGuard
} from '../../authentication/providers/two-fa/guards/auth-two-fa-verification.guard.js'
import { integerFromStringSchema } from '../../configuration/config.schema.js'
import { makeContentDispositionAttachment } from '../files/utils/send-file.js'
import { USERS_ROUTE } from './constants/routes.js'
import { USER_PERMISSION, USER_ROLE } from './constants/user.js'
import { UserHavePermission } from './decorators/permissions.decorator.js'
import { UserHaveRole } from './decorators/roles.decorator.js'
import { GetUser } from './decorators/user.decorator.js'
import { type UserCreateOrUpdateGroupDto, userCreateOrUpdateGroupSchema, userIdsSchema } from './dto/create-or-update-group.dto.js'
import {
  type CreateUserDto,
  createUserSchema,
  type UpdateUserDto,
  type UpdateUserFromGroupDto,
  updateUserFromGroupSchema,
  updateUserSchema
} from './dto/create-or-update-user.dto.js'
import { searchMembersSchema, type ValidatedSearchMembersDto } from './dto/search-members.dto.js'
import {
  type UserAppPasswordDto,
  userAppPasswordSchema,
  type UserLanguageDto,
  userLanguageSchema,
  type UserNotificationDto,
  userNotificationSchema,
  type UserPreferencesDto,
  userPreferencesSchema,
  type UserStorageIndexingDto,
  userStorageIndexingSchema,
  type UserUpdatePasswordDto,
  userUpdatePasswordSchema
} from './dto/user-properties.dto.js'
import { UserPermissionsGuard } from './guards/permissions.guard.js'
import { UserRolesGuard } from './guards/roles.guard.js'
import { GroupBrowse } from './interfaces/group-browse.interface.js'
import { GroupMember } from './interfaces/group-member.js'
import { GuestUser } from './interfaces/guest-user.interface.js'
import { Member } from './interfaces/member.interface.js'
import type { UserPreferences } from './interfaces/user-preferences.interface.js'
import { UserAppPassword } from './interfaces/user-secrets.interface.js'
import { UserModel } from './models/user.model.js'
import { UsersManager } from './services/users-manager.service.js'
import { appPasswordNameParameterSchema, avatarLoginParameterSchema, optionalGroupNameParameterSchema } from './users.schema.js'
import { USER_AVATAR_FILE_NAME } from './utils/avatar.js'

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
  listAppPasswords(@GetUser() user: UserModel): Promise<Omit<UserAppPassword, 'password'>[]> {
    return this.usersManager.listAppPasswords(user)
  }

  @Post(`${USERS_ROUTE.ME}/${USERS_ROUTE.APP_PASSWORDS}`)
  @UserHaveRole(USER_ROLE.USER)
  @UseGuards(AuthTwoFaVerificationOrPasswordGuard)
  generateAppPassword(
    @GetUser() user: UserModel,
    @Body({ schema: userAppPasswordSchema }) userAppPasswordDto: UserAppPasswordDto
  ): Promise<UserAppPassword> {
    return this.usersManager.generateAppPassword(user, userAppPasswordDto)
  }

  @Delete(`${USERS_ROUTE.ME}/${USERS_ROUTE.APP_PASSWORDS}/:name`)
  @UserHaveRole(USER_ROLE.USER)
  @UseGuards(AuthTwoFaVerificationOrPasswordGuard)
  deleteAppPassword(@GetUser() user: UserModel, @Param('name', { schema: appPasswordNameParameterSchema }) name: string): Promise<void> {
    return this.usersManager.deleteAppPassword(user, name)
  }

  @Put(`${USERS_ROUTE.ME}/${USERS_ROUTE.LANGUAGE}`)
  @UserHaveRole(USER_ROLE.GUEST)
  updateLanguage(@GetUser() user: UserModel, @Body({ schema: userLanguageSchema }) userLanguageDto: UserLanguageDto) {
    return this.usersManager.updateLanguage(user, userLanguageDto)
  }

  @Put(`${USERS_ROUTE.ME}/${USERS_ROUTE.PASSWORD}`)
  @UseGuards(AuthTwoFaVerificationWithoutPasswordGuard)
  updatePassword(@GetUser() user: UserModel, @Body({ schema: userUpdatePasswordSchema }) userPasswordDto: UserUpdatePasswordDto) {
    return this.usersManager.updatePassword(user, userPasswordDto)
  }

  @Put(`${USERS_ROUTE.ME}/${USERS_ROUTE.NOTIFICATION}`)
  @UserHaveRole(USER_ROLE.GUEST)
  updateNotification(@GetUser() user: UserModel, @Body({ schema: userNotificationSchema }) userNotificationDto: UserNotificationDto) {
    return this.usersManager.updateNotification(user, userNotificationDto)
  }

  @Patch(`${USERS_ROUTE.ME}/${USERS_ROUTE.PREFERENCES}`)
  @UserHaveRole(USER_ROLE.GUEST)
  updatePreferences(@GetUser() user: UserModel, @Body({ schema: userPreferencesSchema }) dto: UserPreferencesDto): Promise<UserPreferences> {
    return this.usersManager.updatePreferences(user, dto)
  }

  @Put(`${USERS_ROUTE.ME}/${USERS_ROUTE.STORAGE_INDEXING}`)
  @UserHaveRole(USER_ROLE.USER)
  updateStorageIndexing(@GetUser() user: UserModel, @Body({ schema: userStorageIndexingSchema }) userStorageIndexingDto: UserStorageIndexingDto) {
    return this.usersManager.updateStorageIndexing(user, userStorageIndexingDto)
  }

  @Get(`${USERS_ROUTE.AVATAR}/:login`)
  @UserHaveRole(USER_ROLE.LINK)
  @Header('cache-control', 'public,max-age=86400')
  async avatar(@GetUser() user: UserModel, @Param('login', { schema: avatarLoginParameterSchema }) login: 'me' | string): Promise<StreamableFile> {
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
  searchMembers(@GetUser() user: UserModel, @Body({ schema: searchMembersSchema }) searchMembersDto: ValidatedSearchMembersDto): Promise<Member[]> {
    return this.usersManager.searchMembers(user, searchMembersDto)
  }

  @Get(`${USERS_ROUTE.ME}/${USERS_ROUTE.GROUPS}/${USERS_ROUTE.BROWSE}/:name?`)
  browseGroups(@GetUser() user: UserModel, @Param('name', { schema: optionalGroupNameParameterSchema }) name?: string): Promise<GroupBrowse> {
    return this.usersManager.browseGroups(user, name)
  }

  @Post(`${USERS_ROUTE.ME}/${USERS_ROUTE.GROUPS}`)
  @UserHavePermission(USER_PERMISSION.PERSONAL_GROUPS_ADMIN)
  @UseGuards(UserPermissionsGuard)
  createPersonalGroup(
    @GetUser() user: UserModel,
    @Body({ schema: userCreateOrUpdateGroupSchema }) userCreateOrUpdateGroupDto: UserCreateOrUpdateGroupDto
  ): Promise<GroupMember> {
    return this.usersManager.createPersonalGroup(user, userCreateOrUpdateGroupDto)
  }

  @Put(`${USERS_ROUTE.ME}/${USERS_ROUTE.GROUPS}/:id`)
  updatePersonalGroup(
    @GetUser() user: UserModel,
    @Param('id', { schema: integerFromStringSchema }) groupId: number,
    @Body({ schema: userCreateOrUpdateGroupSchema }) userCreateOrUpdateGroupDto: UserCreateOrUpdateGroupDto
  ): Promise<GroupMember> {
    return this.usersManager.updatePersonalGroup(user, groupId, userCreateOrUpdateGroupDto)
  }

  @Delete(`${USERS_ROUTE.ME}/${USERS_ROUTE.GROUPS}/:id`)
  deletePersonalGroup(@GetUser() user: UserModel, @Param('id', { schema: integerFromStringSchema }) groupId: number): Promise<void> {
    return this.usersManager.deletePersonalGroup(user, groupId)
  }

  @Delete(`${USERS_ROUTE.ME}/${USERS_ROUTE.GROUPS}/${USERS_ROUTE.GROUPS_LEAVE}/:id`)
  leavePersonalGroup(@GetUser() user: UserModel, @Param('id', { schema: integerFromStringSchema }) groupId: number): Promise<void> {
    return this.usersManager.leavePersonalGroup(user, groupId)
  }

  @Patch(`${USERS_ROUTE.ME}/${USERS_ROUTE.GROUPS}/:groupId/${USERS_ROUTE.USERS}`)
  addUsersToGroup(
    @GetUser() user: UserModel,
    @Param('groupId', { schema: integerFromStringSchema }) groupId: number,
    @Body({ schema: userIdsSchema }) userIds: number[]
  ): Promise<void> {
    return this.usersManager.addUsersToGroup(user, groupId, userIds)
  }

  @Delete(`${USERS_ROUTE.ME}/${USERS_ROUTE.GROUPS}/:groupId/${USERS_ROUTE.USERS}/:userId`)
  removeUserFromGroup(
    @GetUser() user: UserModel,
    @Param('groupId', { schema: integerFromStringSchema }) groupId: number,
    @Param('userId', { schema: integerFromStringSchema }) userId: number
  ): Promise<void> {
    return this.usersManager.removeUserFromGroup(user, groupId, userId)
  }

  @Patch(`${USERS_ROUTE.ME}/${USERS_ROUTE.GROUPS}/:groupId/${USERS_ROUTE.USERS}/:userId`)
  updateUserFromPersonalGroup(
    @GetUser() user: UserModel,
    @Param('groupId', { schema: integerFromStringSchema }) groupId: number,
    @Param('userId', { schema: integerFromStringSchema }) userId: number,
    @Body({ schema: updateUserFromGroupSchema }) updateUserFromGroupDto: UpdateUserFromGroupDto
  ): Promise<void> {
    return this.usersManager.updateUserFromPersonalGroup(user, groupId, userId, updateUserFromGroupDto)
  }

  @Get(`${USERS_ROUTE.ME}/${USERS_ROUTE.GUESTS}`)
  listGuests(@GetUser() user: UserModel): Promise<GuestUser[]> {
    return this.usersManager.listGuests(user)
  }

  @Get(`${USERS_ROUTE.ME}/${USERS_ROUTE.GUESTS}/:id`)
  getGuest(@GetUser() user: UserModel, @Param('id', { schema: integerFromStringSchema }) guestId: number): Promise<GuestUser> {
    return this.usersManager.getGuest(user, guestId)
  }

  @Post(`${USERS_ROUTE.ME}/${USERS_ROUTE.GUESTS}`)
  @UserHavePermission(USER_PERMISSION.GUESTS_ADMIN)
  @UseGuards(UserPermissionsGuard)
  createGuest(@GetUser() user: UserModel, @Body({ schema: createUserSchema }) createGuestDto: CreateUserDto): Promise<GuestUser> {
    return this.usersManager.createGuest(user, createGuestDto)
  }

  @Put(`${USERS_ROUTE.ME}/${USERS_ROUTE.GUESTS}/:id`)
  updateGuest(
    @GetUser() user: UserModel,
    @Param('id', { schema: integerFromStringSchema }) guestId: number,
    @Body({ schema: updateUserSchema }) updateGuestDto: UpdateUserDto
  ): Promise<GuestUser | null> {
    return this.usersManager.updateGuest(user, guestId, updateGuestDto)
  }

  @Delete(`${USERS_ROUTE.ME}/${USERS_ROUTE.GUESTS}/:id`)
  deleteGuest(@GetUser() user: UserModel, @Param('id', { schema: integerFromStringSchema }) guestId: number): Promise<void> {
    return this.usersManager.deleteGuest(user, guestId)
  }
}
