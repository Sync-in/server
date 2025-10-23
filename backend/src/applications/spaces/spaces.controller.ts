/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  ParseArrayPipe,
  ParseBoolPipe,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Search,
  UseGuards,
  UseInterceptors
} from '@nestjs/common'
import { ContextInterceptor } from '../../infrastructure/context/interceptors/context.interceptor'
import { FileTree } from '../files/interfaces/file-tree.interface'
import { FileError } from '../files/models/file-error'
import { checkExternalPath } from '../files/utils/files'
import { convertToFilesTree, convertToSpacesTree } from '../files/utils/files-tree'
import { CreateOrUpdateShareDto } from '../shares/dto/create-or-update-share.dto'
import { ShareLink } from '../shares/interfaces/share-link.interface'
import { ShareProps } from '../shares/interfaces/share-props.interface'
import { ShareChild } from '../shares/models/share-child.model'
import { USER_PERMISSION, USER_ROLE } from '../users/constants/user'
import { UserHavePermission } from '../users/decorators/permissions.decorator'
import { UserHaveRole } from '../users/decorators/roles.decorator'
import { GetUser } from '../users/decorators/user.decorator'
import { UserPermissionsGuard } from '../users/guards/permissions.guard'
import { UserRolesGuard } from '../users/guards/roles.guard'
import { UserModel } from '../users/models/user.model'
import { SPACES_BASE_ROUTE, SPACES_ROUTE } from './constants/routes'
import { GetSpace } from './decorators/space.decorator'
import { CreateOrUpdateSpaceDto } from './dto/create-or-update-space.dto'
import { DeleteSpaceDto } from './dto/delete-space.dto'
import { SearchSpaceDto } from './dto/search-space.dto'
import { CheckRootExternalPathDto, SpaceRootDto } from './dto/space-roots.dto'
import { SpaceGuard } from './guards/space.guard'
import { SpaceFiles } from './interfaces/space-files.interface'
import { SpaceTrash } from './interfaces/space-trash.interface'
import { SpaceEnv } from './models/space-env.model'
import { SpaceProps } from './models/space-props.model'
import { SpacesBrowser } from './services/spaces-browser.service'
import { SpacesManager } from './services/spaces-manager.service'

@Controller(SPACES_ROUTE.BASE)
@UserHaveRole(USER_ROLE.USER)
@UserHavePermission(USER_PERMISSION.SPACES)
@UseGuards(UserRolesGuard, UserPermissionsGuard)
@UseInterceptors(ContextInterceptor)
export class SpacesController {
  constructor(
    private readonly spacesManager: SpacesManager,
    private readonly spacesBrowser: SpacesBrowser
  ) {}

  @Get(`${SPACES_ROUTE.BROWSE}/*`)
  @UserHaveRole() // override: all roles
  @UserHavePermission() // override: checked in space guard
  @UseGuards(SpaceGuard)
  async browseSpace(@GetUser() user: UserModel, @GetSpace() space: SpaceEnv): Promise<SpaceFiles> {
    return this.spacesBrowser.browse(user, space, { withLocks: true, withSpacesAndShares: true, withSyncs: true, withHasComments: true })
  }

  @Get(`${SPACES_ROUTE.TREE}/${SPACES_BASE_ROUTE}`)
  @UserHaveRole() // override: all roles
  async treeSpaces(@GetUser() user: UserModel): Promise<FileTree[]> {
    const spaces = await this.spacesManager.listSpacesWithPermissions(user)
    return convertToSpacesTree(spaces)
  }

  @Get(`${SPACES_ROUTE.TREE}/*`)
  @UserHaveRole() // override: all roles
  @UserHavePermission() // override: checked in space guard
  @UseGuards(SpaceGuard)
  async treeFiles(
    @GetUser() user: UserModel,
    @GetSpace() space: SpaceEnv,
    @Query('showFiles', new DefaultValuePipe(false), ParseBoolPipe) showFiles?: boolean
  ): Promise<FileTree[]> {
    const spaceFiles = await this.spacesBrowser.browse(user, space)
    return convertToFilesTree(space, spaceFiles.files, !showFiles)
  }

  @Get(SPACES_ROUTE.LIST)
  @UserHaveRole() // override: all roles
  listSpaces(@GetUser() user: UserModel): Promise<SpaceProps[]> {
    return this.spacesManager.spacesWithDetails(user.id)
  }

  @UserHavePermission([USER_PERMISSION.PERSONAL_SPACE, USER_PERMISSION.SPACES])
  @Get(`${SPACES_ROUTE.TRASH}/${SPACES_ROUTE.LIST}`)
  listTrashes(@GetUser() user: UserModel): Promise<SpaceTrash[]> {
    return this.spacesManager.listTrashes(user)
  }

  /* MANAGE SPACES */

  @Search()
  searchSpaces(@GetUser() user: UserModel, @Body() searchSpaceDto: SearchSpaceDto): Promise<SpaceProps[]> {
    return this.spacesManager.searchSpaces(user.id, searchSpaceDto)
  }

  @Get(':id')
  getSpace(@GetUser() user: UserModel, @Param('id', ParseIntPipe) spaceId: number): Promise<SpaceProps> {
    return this.spacesManager.getSpace(user, spaceId)
  }

  @Post()
  @UserHavePermission(USER_PERMISSION.SPACES_ADMIN)
  createSpace(@GetUser() user: UserModel, @Body() createOrUpdateSpaceDto: CreateOrUpdateSpaceDto): Promise<SpaceProps> {
    return this.spacesManager.createSpace(user, createOrUpdateSpaceDto)
  }

  @Put(':id')
  // can be used by space managers
  updateSpace(
    @GetUser() user: UserModel,
    @Param('id', ParseIntPipe) spaceId: number,
    @Body() createOrUpdateSpaceDto: CreateOrUpdateSpaceDto
  ): Promise<SpaceProps> {
    return this.spacesManager.updateSpace(user, spaceId, createOrUpdateSpaceDto)
  }

  @Delete(':id')
  // can be used by space managers
  deleteSpace(@GetUser() user: UserModel, @Param('id', ParseIntPipe) spaceId: number, @Body() deleteSpaceDto?: DeleteSpaceDto) {
    return this.spacesManager.deleteSpace(user, spaceId, deleteSpaceDto)
  }

  /* MANAGE SPACE ROOTS */

  @Get(`:id/${SPACES_ROUTE.ROOTS}`)
  getUserRoots(@GetUser() user: UserModel, @Param('id', ParseIntPipe) spaceId: number): Promise<SpaceRootDto[]> {
    return this.spacesManager.getUserRoots(user, spaceId)
  }

  @Post(`:id/${SPACES_ROUTE.ROOTS}`)
  createUserRoots(
    @GetUser() user: UserModel,
    @Param('id', ParseIntPipe) spaceId: number,
    @Body(new ParseArrayPipe({ items: SpaceRootDto, whitelist: true })) roots: SpaceRootDto[]
  ): Promise<SpaceRootDto[]> {
    return this.spacesManager.updateUserRoots(user, spaceId, roots, true)
  }

  @Put(`:id/${SPACES_ROUTE.ROOTS}`)
  updateUserRoots(
    @GetUser() user: UserModel,
    @Param('id', ParseIntPipe) spaceId: number,
    @Body(new ParseArrayPipe({ items: SpaceRootDto, whitelist: true })) roots: SpaceRootDto[]
  ): Promise<SpaceRootDto[]> {
    return this.spacesManager.updateUserRoots(user, spaceId, roots)
  }

  // Check admin root external path
  @Post(SPACES_ROUTE.ROOT_CHECK)
  @UserHavePermission(USER_PERMISSION.SPACES_ADMIN)
  @UserHaveRole(USER_ROLE.ADMINISTRATOR)
  async checkRootExternalPath(@Body() checkRootExternalPathDto: CheckRootExternalPathDto) {
    /* reserved to admins */
    try {
      await checkExternalPath(checkRootExternalPathDto.path)
    } catch (e: any) {
      if (e instanceof FileError) {
        throw new HttpException(e.message, e.httpCode)
      } else {
        throw new HttpException(e.message, HttpStatus.INTERNAL_SERVER_ERROR)
      }
    }
  }

  /* MANAGE SPACE SHARES */

  @Get(`:id/${SPACES_ROUTE.SHARES}`)
  listSpaceShares(@GetUser() user: UserModel, @Param('id', ParseIntPipe) spaceId: number): Promise<ShareChild[]> {
    return this.spacesManager.listSpaceShares(user, spaceId)
  }

  @Get(`:id/${SPACES_ROUTE.SHARES}/:sid`)
  getSpaceShare(
    @GetUser() user: UserModel,
    @Param('id', ParseIntPipe) spaceId: number,
    @Param('sid', ParseIntPipe) shareId: number
  ): Promise<ShareProps> {
    return this.spacesManager.getSpaceShare(user, spaceId, shareId)
  }

  @Put(`:id/${SPACES_ROUTE.SHARES}/:sid`)
  updateSpaceShare(
    @GetUser() user: UserModel,
    @Param('id', ParseIntPipe) spaceId: number,
    @Param('sid', ParseIntPipe) shareId: number,
    @Body() createOrUpdateShareDto: CreateOrUpdateShareDto
  ): Promise<ShareProps> {
    return this.spacesManager.updateSpaceShare(user, spaceId, shareId, createOrUpdateShareDto)
  }

  @Delete(`:id/${SPACES_ROUTE.SHARES}/:sid`)
  deleteSpaceShare(
    @GetUser() user: UserModel,
    @Param('id', ParseIntPipe) spaceId: number,
    @Param('sid', ParseIntPipe) shareId: number
  ): Promise<void> {
    return this.spacesManager.deleteSpaceShare(user, spaceId, shareId)
  }

  @Get(`:id/${SPACES_ROUTE.LINKS}/:sid`)
  getSpaceShareLink(
    @GetUser() user: UserModel,
    @Param('id', ParseIntPipe) spaceId: number,
    @Param('sid', ParseIntPipe) shareId: number
  ): Promise<ShareLink> {
    return this.spacesManager.getSpaceShareLink(user, spaceId, shareId)
  }
}
