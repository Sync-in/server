import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Res, Search, UseGuards } from '@nestjs/common'
import { type FastifyReply } from 'fastify'
import { LoginResponseDto } from '../../authentication/dto/login-response.dto.js'
import {
  AuthTwoFaVerificationGuard,
  AuthTwoFaVerificationWithoutPasswordGuard
} from '../../authentication/providers/two-fa/guards/auth-two-fa-verification.guard.js'
import { GROUP_TYPE } from './constants/group.js'
import { ADMIN_USERS_ROUTE } from './constants/routes.js'
import { USER_ROLE } from './constants/user.js'
import { UserHaveRole } from './decorators/roles.decorator.js'
import { GetUser } from './decorators/user.decorator.js'
import { CreateOrUpdateGroupDto } from './dto/create-or-update-group.dto.js'
import { CreateUserDto, UpdateUserDto, UpdateUserFromGroupDto } from './dto/create-or-update-user.dto.js'
import { DeleteUserDto } from './dto/delete-user.dto.js'
import { SearchMembersDto } from './dto/search-members.dto.js'
import { UserRolesGuard } from './guards/roles.guard.js'
import { AdminGroup } from './interfaces/admin-group.interface.js'
import { AdminUser } from './interfaces/admin-user.interface.js'
import { GroupBrowse } from './interfaces/group-browse.interface.js'
import { GuestUser } from './interfaces/guest-user.interface.js'
import { Member } from './interfaces/member.interface.js'
import { UserModel } from './models/user.model.js'
import { AdminUsersManager } from './services/admin-users-manager.service.js'

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
  getUser(@Param('id', ParseIntPipe) userId: number): Promise<AdminUser> {
    return this.adminUsersManager.getUser(userId)
  }

  @Post(ADMIN_USERS_ROUTE.USERS)
  @UseGuards(AuthTwoFaVerificationWithoutPasswordGuard)
  createUser(@Body() createUserDto: CreateUserDto): Promise<AdminUser> {
    return this.adminUsersManager.createUserOrGuest(
      createUserDto,
      typeof createUserDto?.role !== 'undefined' ? createUserDto.role : USER_ROLE.USER,
      true
    )
  }

  @Put(`${ADMIN_USERS_ROUTE.USERS}/:id`)
  @UseGuards(AuthTwoFaVerificationWithoutPasswordGuard)
  updateUser(@Param('id', ParseIntPipe) userId: number, @Body() updateUserDto: UpdateUserDto): Promise<AdminUser> {
    return this.adminUsersManager.updateUserOrGuest(userId, updateUserDto)
  }

  @Delete(`${ADMIN_USERS_ROUTE.USERS}/:id`)
  @UseGuards(AuthTwoFaVerificationGuard)
  deleteUser(@Param('id', ParseIntPipe) userId: number, @Body() deleteUserDto: DeleteUserDto): Promise<void> {
    return this.adminUsersManager.deleteUserFromAdmin(userId, deleteUserDto)
  }

  @Get(`${ADMIN_USERS_ROUTE.GUESTS}/${ADMIN_USERS_ROUTE.LIST}`)
  listGuests(): Promise<AdminUser[]> {
    return this.adminUsersManager.listGuests()
  }

  @Get(`${ADMIN_USERS_ROUTE.GUESTS}/:id`)
  getGuest(@Param('id', ParseIntPipe) guestId: number): Promise<AdminUser> {
    return this.adminUsersManager.getGuest(guestId)
  }

  @Post(ADMIN_USERS_ROUTE.GUESTS)
  @UseGuards(AuthTwoFaVerificationWithoutPasswordGuard)
  createGuest(@GetUser() user: UserModel, @Body() createGuestDto: CreateUserDto): Promise<GuestUser> {
    return this.adminUsersManager.createGuest(user, createGuestDto)
  }

  @Put(`${ADMIN_USERS_ROUTE.GUESTS}/:id`)
  @UseGuards(AuthTwoFaVerificationWithoutPasswordGuard)
  updateGuest(@Param('id', ParseIntPipe) guestId: number, @Body() updateGuestDto: UpdateUserDto): Promise<GuestUser> {
    return this.adminUsersManager.updateGuest(guestId, updateGuestDto)
  }

  @Delete(`${ADMIN_USERS_ROUTE.GUESTS}/:id`)
  @UseGuards(AuthTwoFaVerificationGuard)
  deleteGuest(@Param('id', ParseIntPipe) guestId: number): Promise<void> {
    return this.adminUsersManager.deleteGuestFromAdmin(guestId)
  }

  @Search(ADMIN_USERS_ROUTE.MEMBERS)
  searchMembers(@Body() searchMembersDto: SearchMembersDto): Promise<Member[]> {
    return this.adminUsersManager.searchMembers(searchMembersDto)
  }

  @Get(`${ADMIN_USERS_ROUTE.GROUPS}/${ADMIN_USERS_ROUTE.BROWSE}/:name?`)
  browseGroups(@Param('name') name?: string): Promise<GroupBrowse> {
    return this.adminUsersManager.browseGroups(name)
  }

  @Get(`${ADMIN_USERS_ROUTE.PGROUPS}/${ADMIN_USERS_ROUTE.BROWSE}/:name?`)
  browsePersonalGroups(@Param('name') name?: string): Promise<GroupBrowse> {
    return this.adminUsersManager.browseGroups(name, GROUP_TYPE.PERSONAL)
  }

  @Get(`${ADMIN_USERS_ROUTE.GROUPS}/:id`)
  getGroup(@Param('id', ParseIntPipe) groupId: number): Promise<AdminGroup> {
    return this.adminUsersManager.getGroup(groupId)
  }

  @Post(`${ADMIN_USERS_ROUTE.GROUPS}`)
  createGroup(@Body() createGroupDto: CreateOrUpdateGroupDto): Promise<AdminGroup> {
    return this.adminUsersManager.createGroup(createGroupDto)
  }

  @Put(`${ADMIN_USERS_ROUTE.GROUPS}/:id`)
  updateGroup(@Param('id', ParseIntPipe) groupId: number, @Body() updateGroupDto: CreateOrUpdateGroupDto): Promise<AdminGroup> {
    return this.adminUsersManager.updateGroup(groupId, updateGroupDto)
  }

  @Delete(`${ADMIN_USERS_ROUTE.GROUPS}/:id`)
  deleteGroup(@Param('id', ParseIntPipe) groupId: number): Promise<void> {
    return this.adminUsersManager.deleteGroup(groupId)
  }

  @Patch(`${ADMIN_USERS_ROUTE.GROUPS}/:groupId/${ADMIN_USERS_ROUTE.USERS}`)
  addUsersToGroup(@Param('groupId', ParseIntPipe) groupId: number, @Body() userIds: number[]): Promise<void> {
    return this.adminUsersManager.addUsersToGroup(groupId, userIds)
  }

  @Delete(`${ADMIN_USERS_ROUTE.GROUPS}/:groupId/${ADMIN_USERS_ROUTE.USERS}/:userId`)
  removeUserFromGroup(@Param('groupId', ParseIntPipe) groupId: number, @Param('userId', ParseIntPipe) userId: number): Promise<void> {
    return this.adminUsersManager.removeUserFromGroup(groupId, userId)
  }

  @Patch(`${ADMIN_USERS_ROUTE.GROUPS}/:groupId/${ADMIN_USERS_ROUTE.USERS}/:userId`)
  updateUserFromGroup(
    @Param('groupId', ParseIntPipe) groupId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() updateUserFromGroupDto: UpdateUserFromGroupDto
  ): Promise<void> {
    return this.adminUsersManager.updateUserFromGroup(groupId, userId, updateUserFromGroupDto)
  }

  @Post(`${ADMIN_USERS_ROUTE.IMPERSONATE}/:id`)
  @UseGuards(AuthTwoFaVerificationGuard)
  impersonateUser(
    @GetUser() admin: UserModel,
    @Param('id', ParseIntPipe) userId: number,
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
