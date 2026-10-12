import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common'
import { integerFromStringSchema } from '../../configuration/config.schema.js'
import { LINK_TYPE } from '../links/constants/links.js'
import { type CreateOrUpdateLinkDto, createOrUpdateLinkSchema } from '../links/dto/create-or-update-link.dto.js'
import { LinkGuest } from '../links/interfaces/link-guest.interface.js'
import { USER_PERMISSION, USER_ROLE } from '../users/constants/user.js'
import { UserHavePermission } from '../users/decorators/permissions.decorator.js'
import { UserHaveRole } from '../users/decorators/roles.decorator.js'
import { GetUser } from '../users/decorators/user.decorator.js'
import { UserPermissionsGuard } from '../users/guards/permissions.guard.js'
import { UserRolesGuard } from '../users/guards/roles.guard.js'
import { UserModel } from '../users/models/user.model.js'
import { SHARES_ROUTE } from './constants/routes.js'
import { createOrUpdateShareSchema, type ValidatedCreateOrUpdateShareDto } from './dto/create-or-update-share.dto.js'
import type { ShareFile } from './interfaces/share-file.interface.js'
import { ShareLink } from './interfaces/share-link.interface.js'
import type { ShareProps } from './interfaces/share-props.interface.js'
import { ShareChild } from './models/share-child.model.js'
import { SharesManager } from './services/shares-manager.service.js'
import { linkTypeParameterSchema } from './shares.schema.js'

@Controller(SHARES_ROUTE.BASE)
@UserHaveRole(USER_ROLE.USER)
@UserHavePermission(USER_PERMISSION.SHARES_ADMIN)
@UseGuards(UserRolesGuard, UserPermissionsGuard)
export class SharesController {
  constructor(private readonly sharesManager: SharesManager) {}

  /* MANAGE COMMON SHARES */

  @Get(SHARES_ROUTE.LIST)
  listShares(@GetUser() user: UserModel): Promise<ShareFile[]> {
    return this.sharesManager.listShares(user)
  }

  @Get(':id')
  getShareWithMembers(@GetUser() user: UserModel, @Param('id', { schema: integerFromStringSchema }) shareId: number): Promise<ShareProps> {
    return this.sharesManager.getShareWithMembers(user, shareId)
  }

  @Post()
  createShare(
    @GetUser() user: UserModel,
    @Body({ schema: createOrUpdateShareSchema }) createOrUpdateShareDto: ValidatedCreateOrUpdateShareDto
  ): Promise<ShareProps> {
    if (createOrUpdateShareDto.parent?.alias) {
      return this.sharesManager.createChildShare(user, createOrUpdateShareDto)
    }
    return this.sharesManager.createShare(user, createOrUpdateShareDto)
  }

  @Put(':id')
  updateShare(
    @GetUser() user: UserModel,
    @Param('id', { schema: integerFromStringSchema }) shareId: number,
    @Body({ schema: createOrUpdateShareSchema }) createOrUpdateShareDto: ValidatedCreateOrUpdateShareDto
  ): Promise<ShareProps> {
    return this.sharesManager.updateShare(user, shareId, createOrUpdateShareDto)
  }

  @Delete(':id')
  deleteShare(@GetUser() user: UserModel, @Param('id', { schema: integerFromStringSchema }) shareId: number): Promise<void> {
    return this.sharesManager.deleteShare(user, shareId)
  }

  /* MANAGE CHILD SHARES */

  @Get(`:id/${SHARES_ROUTE.CHILDREN}`)
  listChildShares(@GetUser() user: UserModel, @Param('id', { schema: integerFromStringSchema }) shareId: number): Promise<ShareChild[]> {
    return this.sharesManager.listChildShares(user, shareId)
  }

  @Get(`:id/${SHARES_ROUTE.CHILDREN}/:cid`)
  getShareChild(
    @GetUser() user: UserModel,
    @Param('id', { schema: integerFromStringSchema }) shareId: number,
    @Param('cid', { schema: integerFromStringSchema }) childId: number
  ): Promise<ShareProps> {
    return this.sharesManager.getChildShare(user, shareId, childId)
  }

  @Put(`:id/${SHARES_ROUTE.CHILDREN}/:cid`)
  updateShareChild(
    @GetUser() user: UserModel,
    @Param('id', { schema: integerFromStringSchema }) shareId: number,
    @Param('cid', { schema: integerFromStringSchema }) childId: number,
    @Body({ schema: createOrUpdateShareSchema }) createOrUpdateShareDto: ValidatedCreateOrUpdateShareDto
  ): Promise<ShareProps> {
    return this.sharesManager.updateChildShare(user, shareId, childId, createOrUpdateShareDto)
  }

  @Delete(`:id/${SHARES_ROUTE.CHILDREN}/:cid`)
  deleteShareChild(
    @GetUser() user: UserModel,
    @Param('id', { schema: integerFromStringSchema }) shareId: number,
    @Param('cid', { schema: integerFromStringSchema }) childId: number
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
  getShareLink(@GetUser() user: UserModel, @Param('id', { schema: integerFromStringSchema }) shareId: number): Promise<ShareLink> {
    return this.sharesManager.getShareLink(user, shareId)
  }

  @Get(`${SHARES_ROUTE.LINKS}/:id/${SHARES_ROUTE.CHILDREN}/:cid`)
  getChildShareLink(
    @GetUser() user: UserModel,
    @Param('id', { schema: integerFromStringSchema }) shareId: number,
    @Param('cid', { schema: integerFromStringSchema }) childId: number
  ): Promise<ShareLink> {
    return this.sharesManager.getChildShare(user, shareId, childId, true)
  }

  @Get(`${SHARES_ROUTE.LINKS}/:id/:type(space|share)/:typeId`)
  getLinkFromSpaceOrShare(
    @GetUser() user: UserModel,
    @Param('id', { schema: integerFromStringSchema }) linkId: number,
    @Param('type', { schema: linkTypeParameterSchema }) type: LINK_TYPE,
    @Param('typeId', { schema: integerFromStringSchema }) typeId: number
  ): Promise<LinkGuest> {
    return this.sharesManager.getLinkFromSpaceOrShare(user, linkId, typeId, type)
  }

  @Put(`${SHARES_ROUTE.LINKS}/:id/:type(space|share)/:typeId`)
  updateLinkFromSpaceOrShare(
    @GetUser() user: UserModel,
    @Param('id', { schema: integerFromStringSchema }) linkId: number,
    @Param('type', { schema: linkTypeParameterSchema }) type: LINK_TYPE,
    @Param('typeId', { schema: integerFromStringSchema }) typeId: number,
    @Body({ schema: createOrUpdateLinkSchema }) createOrUpdateLinkDto: CreateOrUpdateLinkDto
  ): Promise<LinkGuest> {
    return this.sharesManager.updateLinkFromSpaceOrShare(user, linkId, typeId, type, createOrUpdateLinkDto, true)
  }
}
