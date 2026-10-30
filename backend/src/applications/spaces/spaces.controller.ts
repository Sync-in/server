import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Post, Put, Query, Search, UseGuards } from '@nestjs/common'
import { toErrorMessage } from '../../common/errors.js'
import { integerFromStringSchema } from '../../configuration/config.schema.js'
import { FileTree } from '../files/interfaces/file-tree.interface.js'
import { FileError } from '../files/models/file-error.js'
import { checkExternalPath } from '../files/utils/files.js'
import { convertToFilesTree, convertToSpacesTree } from '../files/utils/files-tree.js'
import { createOrUpdateShareSchema, type ValidatedCreateOrUpdateShareDto } from '../shares/dto/create-or-update-share.dto.js'
import { ShareLink } from '../shares/interfaces/share-link.interface.js'
import type { ShareProps } from '../shares/interfaces/share-props.interface.js'
import { ShareChild } from '../shares/models/share-child.model.js'
import { USER_PERMISSION, USER_ROLE } from '../users/constants/user.js'
import { UserHavePermission } from '../users/decorators/permissions.decorator.js'
import { UserHaveRole } from '../users/decorators/roles.decorator.js'
import { GetUser } from '../users/decorators/user.decorator.js'
import { UserPermissionsGuard } from '../users/guards/permissions.guard.js'
import { UserRolesGuard } from '../users/guards/roles.guard.js'
import { UserModel } from '../users/models/user.model.js'
import { SPACES_BASE_ROUTE, SPACES_ROUTE } from './constants/routes.js'
import { GetSpace } from './decorators/space.decorator.js'
import { createOrUpdateSpaceSchema, type ValidatedCreateOrUpdateSpaceDto } from './dto/create-or-update-space.dto.js'
import type { DeleteSpaceDto } from './dto/delete-space.dto.js'
import { searchSpaceSchema, type ValidatedSearchSpaceDto } from './dto/search-space.dto.js'
import { type CheckRootExternalPathDto, checkRootExternalPathSchema, type SpaceRootDto, spaceRootsSchema } from './dto/space-roots.dto.js'
import { SpaceGuard } from './guards/space.guard.js'
import { SpaceFiles } from './interfaces/space-files.interface.js'
import { SpaceTrash } from './interfaces/space-trash.interface.js'
import { SpaceEnv } from './models/space-env.model.js'
import { SpaceProps } from './models/space-props.model.js'
import { SpacesBrowser } from './services/spaces-browser.service.js'
import { SpacesManager } from './services/spaces-manager.service.js'
import { includeHiddenQuerySchema, optionalDeleteSpaceBodySchema, showFilesQuerySchema } from './spaces.schema.js'

@Controller(SPACES_ROUTE.BASE)
@UserHaveRole(USER_ROLE.USER)
@UserHavePermission(USER_PERMISSION.SPACES)
@UseGuards(UserRolesGuard, UserPermissionsGuard)
export class SpacesController {
  constructor(
    private readonly spacesManager: SpacesManager,
    private readonly spacesBrowser: SpacesBrowser
  ) {}

  @Get(`${SPACES_ROUTE.BROWSE}/*`)
  @UserHaveRole() // override: all roles
  @UserHavePermission() // override: checked in space guard
  @UseGuards(SpaceGuard)
  async browseSpace(
    @GetUser() user: UserModel,
    @GetSpace() space: SpaceEnv,
    @Query('includeHidden', { schema: includeHiddenQuerySchema }) includeHidden = false
  ): Promise<SpaceFiles> {
    return this.spacesBrowser.browse(user, space, true, includeHidden)
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
    @Query('showFiles', { schema: showFilesQuerySchema }) showFiles = false
  ): Promise<FileTree[]> {
    const spaceFiles = await this.spacesBrowser.browse(user, space)
    return convertToFilesTree(space, spaceFiles.files, !showFiles)
  }

  @Get(SPACES_ROUTE.LIST)
  @UserHaveRole() // override: all roles
  listSpaces(@GetUser() user: UserModel): Promise<SpaceProps[]> {
    return this.spacesManager.spacesWithDetails(user.id)
  }

  @Get(`${SPACES_ROUTE.ADMIN}/${SPACES_ROUTE.LIST}`)
  @UserHaveRole(USER_ROLE.ADMINISTRATOR)
  listSpacesAsAdmin(): Promise<SpaceProps[]> {
    return this.spacesManager.listSpacesAsAdmin()
  }

  @Get(`${SPACES_ROUTE.TRASH}/${SPACES_ROUTE.LIST}`)
  @UserHavePermission([USER_PERMISSION.PERSONAL_SPACE, USER_PERMISSION.SPACES])
  listTrashes(@GetUser() user: UserModel): Promise<SpaceTrash[]> {
    return this.spacesManager.listTrashes(user)
  }

  /* MANAGE SPACES */

  @Search()
  searchSpaces(@GetUser() user: UserModel, @Body({ schema: searchSpaceSchema }) searchSpaceDto: ValidatedSearchSpaceDto): Promise<SpaceProps[]> {
    return this.spacesManager.searchSpaces(user.id, searchSpaceDto)
  }

  @Get(':id')
  getSpace(@GetUser() user: UserModel, @Param('id', { schema: integerFromStringSchema }) spaceId: number): Promise<SpaceProps> {
    return this.spacesManager.getSpace(user, spaceId)
  }

  @Post()
  @UserHavePermission(USER_PERMISSION.SPACES_ADMIN)
  createSpace(
    @GetUser() user: UserModel,
    @Body({ schema: createOrUpdateSpaceSchema }) createOrUpdateSpaceDto: ValidatedCreateOrUpdateSpaceDto
  ): Promise<SpaceProps> {
    return this.spacesManager.createSpace(user, createOrUpdateSpaceDto)
  }

  @Put(':id')
  // can be used by space managers
  updateSpace(
    @GetUser() user: UserModel,
    @Param('id', { schema: integerFromStringSchema }) spaceId: number,
    @Body({ schema: createOrUpdateSpaceSchema }) createOrUpdateSpaceDto: ValidatedCreateOrUpdateSpaceDto
  ): Promise<SpaceProps | null> {
    return this.spacesManager.updateSpace(user, spaceId, createOrUpdateSpaceDto)
  }

  @Delete(':id')
  // can be used by space managers
  deleteSpace(
    @GetUser() user: UserModel,
    @Param('id', { schema: integerFromStringSchema }) spaceId: number,
    @Body({ schema: optionalDeleteSpaceBodySchema }) deleteSpaceDto?: DeleteSpaceDto
  ) {
    return this.spacesManager.deleteSpace(user, spaceId, deleteSpaceDto)
  }

  /* MANAGE SPACE ROOTS */

  @Get(`:id/${SPACES_ROUTE.ROOTS}`)
  getUserRoots(@GetUser() user: UserModel, @Param('id', { schema: integerFromStringSchema }) spaceId: number): Promise<SpaceRootDto[]> {
    return this.spacesManager.getUserRoots(user, spaceId)
  }

  @Post(`:id/${SPACES_ROUTE.ROOTS}`)
  createUserRoots(
    @GetUser() user: UserModel,
    @Param('id', { schema: integerFromStringSchema }) spaceId: number,
    @Body({ schema: spaceRootsSchema }) roots: SpaceRootDto[]
  ): Promise<SpaceRootDto[]> {
    return this.spacesManager.updateUserRoots(user, spaceId, roots, true)
  }

  @Put(`:id/${SPACES_ROUTE.ROOTS}`)
  updateUserRoots(
    @GetUser() user: UserModel,
    @Param('id', { schema: integerFromStringSchema }) spaceId: number,
    @Body({ schema: spaceRootsSchema }) roots: SpaceRootDto[]
  ): Promise<SpaceRootDto[]> {
    return this.spacesManager.updateUserRoots(user, spaceId, roots)
  }

  // Check admin root external path
  @Post(SPACES_ROUTE.ROOT_CHECK)
  @UserHavePermission(USER_PERMISSION.SPACES_ADMIN)
  @UserHaveRole(USER_ROLE.ADMINISTRATOR)
  async checkRootExternalPath(@Body({ schema: checkRootExternalPathSchema }) checkRootExternalPathDto: CheckRootExternalPathDto) {
    /* reserved to admins */
    try {
      await checkExternalPath(checkRootExternalPathDto.path)
    } catch (e) {
      throw new HttpException(toErrorMessage(e), e instanceof FileError ? e.httpCode : HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  /* MANAGE SPACE SHARES */

  @Get(`:id/${SPACES_ROUTE.SHARES}`)
  listSpaceShares(@GetUser() user: UserModel, @Param('id', { schema: integerFromStringSchema }) spaceId: number): Promise<ShareChild[]> {
    return this.spacesManager.listSpaceShares(user, spaceId)
  }

  @Get(`:id/${SPACES_ROUTE.SHARES}/:sid`)
  getSpaceShare(
    @GetUser() user: UserModel,
    @Param('id', { schema: integerFromStringSchema }) spaceId: number,
    @Param('sid', { schema: integerFromStringSchema }) shareId: number
  ): Promise<ShareProps> {
    return this.spacesManager.getSpaceShare(user, spaceId, shareId)
  }

  @Put(`:id/${SPACES_ROUTE.SHARES}/:sid`)
  updateSpaceShare(
    @GetUser() user: UserModel,
    @Param('id', { schema: integerFromStringSchema }) spaceId: number,
    @Param('sid', { schema: integerFromStringSchema }) shareId: number,
    @Body({ schema: createOrUpdateShareSchema }) createOrUpdateShareDto: ValidatedCreateOrUpdateShareDto
  ): Promise<ShareProps> {
    return this.spacesManager.updateSpaceShare(user, spaceId, shareId, createOrUpdateShareDto)
  }

  @Delete(`:id/${SPACES_ROUTE.SHARES}/:sid`)
  deleteSpaceShare(
    @GetUser() user: UserModel,
    @Param('id', { schema: integerFromStringSchema }) spaceId: number,
    @Param('sid', { schema: integerFromStringSchema }) shareId: number
  ): Promise<void> {
    return this.spacesManager.deleteSpaceShare(user, spaceId, shareId)
  }

  @Get(`:id/${SPACES_ROUTE.LINKS}/:sid`)
  getSpaceShareLink(
    @GetUser() user: UserModel,
    @Param('id', { schema: integerFromStringSchema }) spaceId: number,
    @Param('sid', { schema: integerFromStringSchema }) shareId: number
  ): Promise<ShareLink> {
    return this.spacesManager.getSpaceShareLink(user, spaceId, shareId)
  }
}
