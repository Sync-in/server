import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Res, Search, UseGuards } from '@nestjs/common'
import { type FastifyReply } from 'fastify'
import { LoginResponseDto } from '../../authentication/dto/login-response.dto.js'
import {
  AuthTwoFaVerificationGuard,
  AuthTwoFaVerificationWithoutPasswordGuard
} from '../../authentication/providers/two-fa/guards/auth-two-fa-verification.guard.js'
import { integerFromStringSchema } from '../../configuration/config.schema.js'
import { GROUP_TYPE } from './constants/group.js'
import { ADMIN_USERS_ROUTE } from './constants/routes.js'
import { USER_ROLE } from './constants/user.js'
import { UserHaveRole } from './decorators/roles.decorator.js'
import { GetUser } from './decorators/user.decorator.js'
import { type CreateOrUpdateGroupDto, createOrUpdateGroupSchema, userIdsSchema } from './dto/create-or-update-group.dto.js'
import {
  type CreateUserDto,
  createUserSchema,
  type UpdateUserDto,
  type UpdateUserFromGroupDto,
  updateUserFromGroupSchema,
  updateUserSchema
} from './dto/create-or-update-user.dto.js'
import { type DeleteUserDto, deleteUserSchema } from './dto/delete-user.dto.js'
import { searchMembersSchema, type ValidatedSearchMembersDto } from './dto/search-members.dto.js'
import { UserRolesGuard } from './guards/roles.guard.js'
import { AdminGroup } from './interfaces/admin-group.interface.js'
import { AdminUser } from './interfaces/admin-user.interface.js'
import { GroupBrowse } from './interfaces/group-browse.interface.js'
import { GuestUser } from './interfaces/guest-user.interface.js'
import { Member } from './interfaces/member.interface.js'
import { UserModel } from './models/user.model.js'
import { AdminUsersManager } from './services/admin-users-manager.service.js'
import { optionalGroupNameParameterSchema } from './users.schema.js'

@Controller(ADMIN_USERS_ROUTE.BASE)
@UserHaveRole(USER_ROLE.ADMINISTRATOR)
@UseGuards(UserRolesGuard)
export class AdminUsersController {
  constructor(private readonly adminUsersManager: AdminUsersManager) {}

  @Get(`${ADMIN_USERS_ROUTE.USERS}/${ADMIN_USERS_ROUTE.LIST}`)
  listUsers(): Promise<AdminUser[]> {
    return this.adminUsersManager.listUsers()
  }

  @Get(`${ADMIN_USERS_ROUTE.USERS}/:id`)
  getUser(@Param('id', { schema: integerFromStringSchema }) userId: number): Promise<AdminUser> {
    return this.adminUsersManager.getUser(userId)
  }

  @Post(ADMIN_USERS_ROUTE.USERS)
  @UseGuards(AuthTwoFaVerificationWithoutPasswordGuard)
  createUser(@Body({ schema: createUserSchema }) createUserDto: CreateUserDto): Promise<AdminUser> {
    return this.adminUsersManager.createUserOrGuest(createUserDto, createUserDto.role ?? USER_ROLE.USER, true)
  }

  @Put(`${ADMIN_USERS_ROUTE.USERS}/:id`)
  @UseGuards(AuthTwoFaVerificationWithoutPasswordGuard)
  updateUser(
    @Param('id', { schema: integerFromStringSchema }) userId: number,
    @Body({ schema: updateUserSchema }) updateUserDto: UpdateUserDto
  ): Promise<AdminUser> {
    return this.adminUsersManager.updateUserOrGuest(userId, updateUserDto)
  }

  @Delete(`${ADMIN_USERS_ROUTE.USERS}/:id`)
  @UseGuards(AuthTwoFaVerificationGuard)
  deleteUser(
    @Param('id', { schema: integerFromStringSchema }) userId: number,
    @Body({ schema: deleteUserSchema }) deleteUserDto: DeleteUserDto
  ): Promise<void> {
    return this.adminUsersManager.deleteUserFromAdmin(userId, deleteUserDto)
  }

  @Get(`${ADMIN_USERS_ROUTE.GUESTS}/${ADMIN_USERS_ROUTE.LIST}`)
  listGuests(): Promise<GuestUser[]> {
    return this.adminUsersManager.listGuests()
  }

  @Get(`${ADMIN_USERS_ROUTE.GUESTS}/:id`)
  getGuest(@Param('id', { schema: integerFromStringSchema }) guestId: number): Promise<GuestUser> {
    return this.adminUsersManager.getGuest(guestId)
  }

  @Post(ADMIN_USERS_ROUTE.GUESTS)
  @UseGuards(AuthTwoFaVerificationWithoutPasswordGuard)
  createGuest(@GetUser() user: UserModel, @Body({ schema: createUserSchema }) createGuestDto: CreateUserDto): Promise<GuestUser> {
    return this.adminUsersManager.createGuest(user, createGuestDto)
  }

  @Put(`${ADMIN_USERS_ROUTE.GUESTS}/:id`)
  @UseGuards(AuthTwoFaVerificationWithoutPasswordGuard)
  updateGuest(
    @Param('id', { schema: integerFromStringSchema }) guestId: number,
    @Body({ schema: updateUserSchema }) updateGuestDto: UpdateUserDto
  ): Promise<GuestUser> {
    return this.adminUsersManager.updateGuest(guestId, updateGuestDto)
  }

  @Delete(`${ADMIN_USERS_ROUTE.GUESTS}/:id`)
  @UseGuards(AuthTwoFaVerificationGuard)
  deleteGuest(@Param('id', { schema: integerFromStringSchema }) guestId: number): Promise<void> {
    return this.adminUsersManager.deleteGuestFromAdmin(guestId)
  }

  @Search(ADMIN_USERS_ROUTE.MEMBERS)
  searchMembers(@Body({ schema: searchMembersSchema }) searchMembersDto: ValidatedSearchMembersDto): Promise<Member[]> {
    return this.adminUsersManager.searchMembers(searchMembersDto)
  }

  @Get(`${ADMIN_USERS_ROUTE.GROUPS}/${ADMIN_USERS_ROUTE.BROWSE}/:name?`)
  browseGroups(@Param('name', { schema: optionalGroupNameParameterSchema }) name?: string): Promise<GroupBrowse> {
    return this.adminUsersManager.browseGroups(name)
  }

  @Get(`${ADMIN_USERS_ROUTE.PGROUPS}/${ADMIN_USERS_ROUTE.BROWSE}/:name?`)
  browsePersonalGroups(@Param('name', { schema: optionalGroupNameParameterSchema }) name?: string): Promise<GroupBrowse> {
    return this.adminUsersManager.browseGroups(name, GROUP_TYPE.PERSONAL)
  }

  @Get(`${ADMIN_USERS_ROUTE.GROUPS}/:id`)
  getGroup(@Param('id', { schema: integerFromStringSchema }) groupId: number): Promise<AdminGroup> {
    return this.adminUsersManager.getGroup(groupId)
  }

  @Post(`${ADMIN_USERS_ROUTE.GROUPS}`)
  createGroup(@Body({ schema: createOrUpdateGroupSchema }) createGroupDto: CreateOrUpdateGroupDto): Promise<AdminGroup> {
    return this.adminUsersManager.createGroup(createGroupDto)
  }

  @Put(`${ADMIN_USERS_ROUTE.GROUPS}/:id`)
  updateGroup(
    @Param('id', { schema: integerFromStringSchema }) groupId: number,
    @Body({ schema: createOrUpdateGroupSchema }) updateGroupDto: CreateOrUpdateGroupDto
  ): Promise<AdminGroup> {
    return this.adminUsersManager.updateGroup(groupId, updateGroupDto)
  }

  @Delete(`${ADMIN_USERS_ROUTE.GROUPS}/:id`)
  deleteGroup(@Param('id', { schema: integerFromStringSchema }) groupId: number): Promise<void> {
    return this.adminUsersManager.deleteGroup(groupId)
  }

  @Patch(`${ADMIN_USERS_ROUTE.GROUPS}/:groupId/${ADMIN_USERS_ROUTE.USERS}`)
  addUsersToGroup(
    @Param('groupId', { schema: integerFromStringSchema }) groupId: number,
    @Body({ schema: userIdsSchema }) userIds: number[]
  ): Promise<void> {
    return this.adminUsersManager.addUsersToGroup(groupId, userIds)
  }

  @Delete(`${ADMIN_USERS_ROUTE.GROUPS}/:groupId/${ADMIN_USERS_ROUTE.USERS}/:userId`)
  removeUserFromGroup(
    @Param('groupId', { schema: integerFromStringSchema }) groupId: number,
    @Param('userId', { schema: integerFromStringSchema }) userId: number
  ): Promise<void> {
    return this.adminUsersManager.removeUserFromGroup(groupId, userId)
  }

  @Patch(`${ADMIN_USERS_ROUTE.GROUPS}/:groupId/${ADMIN_USERS_ROUTE.USERS}/:userId`)
  updateUserFromGroup(
    @Param('groupId', { schema: integerFromStringSchema }) groupId: number,
    @Param('userId', { schema: integerFromStringSchema }) userId: number,
    @Body({ schema: updateUserFromGroupSchema }) updateUserFromGroupDto: UpdateUserFromGroupDto
  ): Promise<void> {
    return this.adminUsersManager.updateUserFromGroup(groupId, userId, updateUserFromGroupDto)
  }

  @Post(`${ADMIN_USERS_ROUTE.IMPERSONATE}/:id`)
  @UseGuards(AuthTwoFaVerificationGuard)
  impersonateUser(
    @GetUser() admin: UserModel,
    @Param('id', { schema: integerFromStringSchema }) userId: number,
    @Res({ passthrough: true }) res: FastifyReply
  ): Promise<LoginResponseDto> {
    return this.adminUsersManager.impersonateUser(admin, userId, res)
  }

  @Post(`${ADMIN_USERS_ROUTE.IMPERSONATE}/${ADMIN_USERS_ROUTE.LOGOUT}`)
  @UserHaveRole(USER_ROLE.GUEST)
  logOutImpersonateUser(@GetUser() user: UserModel, @Res({ passthrough: true }) res: FastifyReply): Promise<LoginResponseDto> {
    return this.adminUsersManager.logoutImpersonateUser(user, res)
  }
}
