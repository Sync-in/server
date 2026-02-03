import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, UseGuards, UseInterceptors } from '@nestjs/common'
import { ContextInterceptor } from '../../infrastructure/context/interceptors/context.interceptor'
import { LINK_TYPE } from '../links/constants/links'
import { CreateOrUpdateLinkDto } from '../links/dto/create-or-update-link.dto'
import { LinkGuest } from '../links/interfaces/link-guest.interface'
import { USER_PERMISSION, USER_ROLE } from '../users/constants/user'
import { UserHavePermission } from '../users/decorators/permissions.decorator'
import { UserHaveRole } from '../users/decorators/roles.decorator'
import { GetUser } from '../users/decorators/user.decorator'
import { UserPermissionsGuard } from '../users/guards/permissions.guard'
import { UserRolesGuard } from '../users/guards/roles.guard'
import { UserModel } from '../users/models/user.model'
import { SHARES_ROUTE } from './constants/routes'
import { CreateOrUpdateShareDto } from './dto/create-or-update-share.dto'
import type { ShareFile } from './interfaces/share-file.interface'
import { ShareLink } from './interfaces/share-link.interface'
import type { ShareProps } from './interfaces/share-props.interface'
import { ShareChild } from './models/share-child.model'
import { SharesManager } from './services/shares-manager.service'

@Controller(SHARES_ROUTE.BASE)
@UserHaveRole(USER_ROLE.USER)
@UserHavePermission(USER_PERMISSION.SHARES_ADMIN)
@UseGuards(UserRolesGuard, UserPermissionsGuard)
@UseInterceptors(ContextInterceptor)
export class SharesController {
  constructor(private readonly sharesManager: SharesManager) {}

  /* MANAGE COMMON SHARES */

  @Get(SHARES_ROUTE.LIST)
  listShares(@GetUser() user: UserModel): Promise<ShareFile[]> {
    return this.sharesManager.listShares(user)
  }

  @Get(':id')
  getShareWithMembers(@GetUser() user: UserModel, @Param('id', ParseIntPipe) shareId: number): Promise<ShareProps> {
    return this.sharesManager.getShareWithMembers(user, shareId)
  }

  @Post()
  createShare(@GetUser() user: UserModel, @Body() createOrUpdateShareDto: CreateOrUpdateShareDto): Promise<ShareProps> {
    if (createOrUpdateShareDto.parent?.alias) {
      return this.sharesManager.createChildShare(user, createOrUpdateShareDto)
    }
    return this.sharesManager.createShare(user, createOrUpdateShareDto)
  }

  @Put(':id')
  updateShare(
    @GetUser() user: UserModel,
    @Param('id', ParseIntPipe) shareId: number,
    @Body() createOrUpdateShareDto: CreateOrUpdateShareDto
  ): Promise<ShareProps> {
    return this.sharesManager.updateShare(user, shareId, createOrUpdateShareDto)
  }

  @Delete(':id')
  deleteShare(@GetUser() user: UserModel, @Param('id', ParseIntPipe) shareId: number): Promise<void> {
    return this.sharesManager.deleteShare(user, shareId)
  }

  /* MANAGE CHILD SHARES */

  @Get(`:id/${SHARES_ROUTE.CHILDREN}`)
  listChildShares(@GetUser() user: UserModel, @Param('id', ParseIntPipe) shareId: number): Promise<ShareChild[]> {
    return this.sharesManager.listChildShares(user, shareId)
  }

  @Get(`:id/${SHARES_ROUTE.CHILDREN}/:cid`)
  getShareChild(
    @GetUser() user: UserModel,
    @Param('id', ParseIntPipe) shareId: number,
    @Param('cid', ParseIntPipe) childId: number
  ): Promise<ShareProps> {
    return this.sharesManager.getChildShare(user, shareId, childId)
  }

  @Put(`:id/${SHARES_ROUTE.CHILDREN}/:cid`)
  updateShareChild(
    @GetUser() user: UserModel,
    @Param('id', ParseIntPipe) shareId: number,
    @Param('cid', ParseIntPipe) childId: number,
    @Body() createOrUpdateShareDto: CreateOrUpdateShareDto
  ): Promise<ShareProps> {
    return this.sharesManager.updateChildShare(user, shareId, childId, createOrUpdateShareDto)
  }

  @Delete(`:id/${SHARES_ROUTE.CHILDREN}/:cid`)
  deleteShareChild(
    @GetUser() user: UserModel,
    @Param('id', ParseIntPipe) shareId: number,
    @Param('cid', ParseIntPipe) childId: number
  ): Promise<void> {
    return this.sharesManager.deleteChildShare(user, shareId, childId)
  }

  /* MANAGE LINK SHARES */

  @Get(SHARES_ROUTE.LINKS_UUID)
  @UserHavePermission([USER_PERMISSION.SHARES_ADMIN, USER_PERMISSION.SPACES_ADMIN])
  generateUUID(@GetUser() user: UserModel): Promise<{ uuid: string }> {
    return this.sharesManager.generateLinkUUID(user.id)
  }

  @Get(SHARES_ROUTE.LINKS_LIST)
  listShareLinks(@GetUser() user: UserModel): Promise<ShareLink[]> {
    return this.sharesManager.listShareLinks(user)
  }

  @Get(`${SHARES_ROUTE.LINKS}/:id`)
  getShareLink(@GetUser() user: UserModel, @Param('id', ParseIntPipe) shareId: number): Promise<ShareLink> {
    return this.sharesManager.getShareLink(user, shareId)
  }

  @Get(`${SHARES_ROUTE.LINKS}/:id/${SHARES_ROUTE.CHILDREN}/:cid`)
  getChildShareLink(
    @GetUser() user: UserModel,
    @Param('id', ParseIntPipe) shareId: number,
    @Param('cid', ParseIntPipe) childId: number
  ): Promise<ShareLink> {
    return this.sharesManager.getChildShare(user, shareId, childId, true)
  }

  @Get(`${SHARES_ROUTE.LINKS}/:id/:type(space|share)/:typeId`)
  getLinkFromSpaceOrShare(
    @GetUser() user: UserModel,
    @Param('id', ParseIntPipe) linkId: number,
    @Param('type') type: LINK_TYPE,
    @Param('typeId', ParseIntPipe) typeId: number
  ): Promise<LinkGuest> {
    return this.sharesManager.getLinkFromSpaceOrShare(user, linkId, typeId, type)
  }

  @Put(`${SHARES_ROUTE.LINKS}/:id/:type(space|share)/:typeId`)
  updateLinkFromSpaceOrShare(
    @GetUser() user: UserModel,
    @Param('id', ParseIntPipe) linkId: number,
    @Param('type') type: LINK_TYPE,
    @Param('typeId', ParseIntPipe) typeId: number,
    @Body() createOrUpdateLinkDto: CreateOrUpdateLinkDto
  ): Promise<LinkGuest> {
    return this.sharesManager.updateLinkFromSpaceOrShare(user, linkId, typeId, type, createOrUpdateLinkDto, true)
  }
}
