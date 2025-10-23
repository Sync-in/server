/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import {
  Body,
  Controller,
  Copy,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Move,
  Param,
  ParseArrayPipe,
  ParseIntPipe,
  Post,
  Proppatch,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common'
import { FastifyReply, FastifyRequest } from 'fastify'
import { AuthTokenSkip } from '../../authentication/decorators/auth-token-skip.decorator'
import { ContextInterceptor } from '../../infrastructure/context/interceptors/context.interceptor'
import { SkipSpacePermissionsCheck } from '../spaces/decorators/space-skip-permissions.decorator'
import { FastifySpaceRequest } from '../spaces/interfaces/space-request.interface'
import { USER_PERMISSION } from '../users/constants/user'
import { UserHavePermission } from '../users/decorators/permissions.decorator'
import { GetUser } from '../users/decorators/user.decorator'
import { UserPermissionsGuard } from '../users/guards/permissions.guard'
import { UserModel } from '../users/models/user.model'
import { CLIENT_AUTH_TYPE } from './constants/auth'
import { SYNC_ROUTE } from './constants/routes'
import { CHECK_SERVER_RESP, SYNC_IN_SERVER_AGENT } from './constants/sync'
import { SyncEnvironment } from './decorators/sync-environment.decorator'
import { SyncClientAuthDto } from './dtos/sync-client-auth.dto'
import type { SyncClientRegistrationDto } from './dtos/sync-client-registration.dto'
import { SyncCopyMoveDto, SyncDiffDto, SyncMakeDto, SyncPropsDto } from './dtos/sync-operations.dto'
import { SyncPathDto, SyncPathUpdateDto } from './dtos/sync-path.dto'
import { SyncUploadDto } from './dtos/sync-upload.dto'
import { SyncDiffGzipBodyInterceptor } from './interceptors/sync-diff-gzip-body.interceptor'
import { AppStoreManifest } from './interfaces/store-manifest.interface'
import { ClientAuthCookieDto, ClientAuthTokenDto } from './interfaces/sync-client-auth.interface'
import { SyncClientPaths } from './interfaces/sync-client-paths.interface'
import { SyncPathSettings } from './interfaces/sync-path.interface'
import { SyncClientsManager } from './services/sync-clients-manager.service'
import { SyncManager } from './services/sync-manager.service'
import { SyncPathsManager } from './services/sync-paths-manager.service'

@Controller(SYNC_ROUTE.BASE)
export class SyncController {
  constructor(
    private readonly syncManager: SyncManager,
    private readonly syncClientsManager: SyncClientsManager,
    private readonly syncPathsManager: SyncPathsManager
  ) {}

  /* CLIENT */

  @Get(SYNC_ROUTE.HANDSHAKE)
  @AuthTokenSkip()
  handshake(@Req() req: FastifyRequest) {
    if ('user-agent' in req.headers && req.headers['user-agent'].startsWith(SYNC_IN_SERVER_AGENT)) {
      return CHECK_SERVER_RESP
    }
    throw new HttpException('Server not found', HttpStatus.NOT_FOUND)
  }

  @Post(SYNC_ROUTE.REGISTER)
  @AuthTokenSkip()
  register(@Body() syncClientRegistrationDto: SyncClientRegistrationDto, @Req() req: FastifyRequest): Promise<{ clientToken: string }> {
    return this.syncClientsManager.register(syncClientRegistrationDto, req.ip)
  }

  @Post(SYNC_ROUTE.UNREGISTER)
  @UserHavePermission(USER_PERMISSION.DESKTOP_APP)
  @UseGuards(UserPermissionsGuard)
  unregister(@GetUser() user: UserModel): Promise<void> {
    return this.syncClientsManager.unregister(user)
  }

  @Get(SYNC_ROUTE.APP_STORE)
  @AuthTokenSkip()
  checkAppStore(): Promise<AppStoreManifest> {
    return this.syncClientsManager.checkAppStore()
  }

  @Post(`${SYNC_ROUTE.AUTH}/:type`)
  @AuthTokenSkip()
  authenticate(
    @Param('type') type: CLIENT_AUTH_TYPE,
    @Body() clientAuthDto: SyncClientAuthDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply
  ): Promise<ClientAuthCookieDto | ClientAuthTokenDto> {
    return this.syncClientsManager.authenticate(type, clientAuthDto, req.ip, res)
  }

  @Get(SYNC_ROUTE.CLIENTS)
  @UserHavePermission(USER_PERMISSION.DESKTOP_APP)
  @UseGuards(UserPermissionsGuard)
  getClients(@GetUser() user: UserModel): Promise<SyncClientPaths[]> {
    return this.syncClientsManager.getClients(user)
  }

  @Delete(`${SYNC_ROUTE.CLIENTS}/:id`)
  @UserHavePermission(USER_PERMISSION.DESKTOP_APP)
  @UseGuards(UserPermissionsGuard)
  deleteClient(@GetUser() user: UserModel, @Param('id') clientId: string): Promise<void> {
    return this.syncClientsManager.deleteClient(user, clientId)
  }

  /* PATHS */

  @Delete(`${SYNC_ROUTE.CLIENTS}/:id/${SYNC_ROUTE.PATHS}/:pathId`)
  @UserHavePermission(USER_PERMISSION.DESKTOP_APP_SYNC)
  @UseGuards(UserPermissionsGuard)
  deleteClientPath(@GetUser() user: UserModel, @Param('id') clientId: string, @Param('pathId', ParseIntPipe) pathId: number): Promise<void> {
    return this.syncPathsManager.deletePath(user, pathId, clientId)
  }

  @Put(`${SYNC_ROUTE.CLIENTS}/:id/${SYNC_ROUTE.PATHS}/:pathId`)
  @UserHavePermission(USER_PERMISSION.DESKTOP_APP_SYNC)
  @UseGuards(UserPermissionsGuard)
  updatePath(
    @GetUser() user: UserModel,
    @Param('id') clientId: string,
    @Param('pathId', ParseIntPipe) pathId: number,
    @Body() syncPathUpdateDto: SyncPathUpdateDto
  ): Promise<SyncPathSettings> {
    return this.syncPathsManager.updatePath(user, clientId, pathId, syncPathUpdateDto)
  }

  @Post(`${SYNC_ROUTE.PATHS}/*`)
  @SkipSpacePermissionsCheck()
  @SyncEnvironment()
  createPath(
    @Req() req: FastifySpaceRequest,
    @Body() syncPathDto: SyncPathDto
  ): Promise<{
    id: number
    permissions: string
  }> {
    return this.syncPathsManager.createPath(req, syncPathDto)
  }

  @Delete(`${SYNC_ROUTE.PATHS}/:id`)
  @UserHavePermission(USER_PERMISSION.DESKTOP_APP_SYNC)
  @UseGuards(UserPermissionsGuard)
  deletePath(@GetUser() user: UserModel, @Param('id', ParseIntPipe) pathId: number): Promise<void> {
    return this.syncPathsManager.deletePath(user, pathId)
  }

  @Put(SYNC_ROUTE.PATHS)
  @UserHavePermission(USER_PERMISSION.DESKTOP_APP_SYNC)
  @UseGuards(UserPermissionsGuard)
  @UseInterceptors(ContextInterceptor)
  updatePaths(
    @GetUser() user: UserModel,
    @Body(new ParseArrayPipe({ items: SyncPathDto, whitelist: true })) syncPathsDto: SyncPathDto[]
  ): Promise<{
    add: SyncPathSettings[]
    update: Partial<Record<keyof SyncPathSettings, any>>[]
    delete: number[]
  }> {
    return this.syncPathsManager.updatePaths(user, syncPathsDto)
  }

  /* OPERATIONS */

  @Post(`${SYNC_ROUTE.OPERATION}/${SYNC_ROUTE.DIFF}/:id`)
  @UserHavePermission(USER_PERMISSION.DESKTOP_APP_SYNC)
  @UseGuards(UserPermissionsGuard)
  @UseInterceptors(SyncDiffGzipBodyInterceptor)
  diff(
    @GetUser() user: UserModel,
    @Param('id', ParseIntPipe) pathId: number,
    @Body() syncDiffDto: SyncDiffDto,
    @Res({ passthrough: true }) res: FastifyReply
  ): Promise<void> {
    return this.syncManager.diff(user, pathId, syncDiffDto, res)
  }

  @Get(`${SYNC_ROUTE.OPERATION}/*`)
  @SyncEnvironment()
  download(@Req() req: FastifySpaceRequest, @Res({ passthrough: true }) res: FastifyReply): Promise<StreamableFile> {
    return this.syncManager.download(req, res)
  }

  @Post(`${SYNC_ROUTE.OPERATION}/*`)
  @SyncEnvironment()
  uploadCreate(@Req() req: FastifySpaceRequest, @Query() syncUploadDto: SyncUploadDto): Promise<{ ino: number }> {
    return this.syncManager.upload(req, syncUploadDto)
  }

  @Put(`${SYNC_ROUTE.OPERATION}/*`)
  @SyncEnvironment()
  uploadOverwrite(@Req() req: FastifySpaceRequest, @Query() syncUploadDto: SyncUploadDto): Promise<{ ino: number }> {
    return this.syncManager.upload(req, syncUploadDto)
  }

  @Post(`${SYNC_ROUTE.OPERATION}/${SYNC_ROUTE.MAKE}/*`)
  @SyncEnvironment()
  make(@Req() req: FastifySpaceRequest, @Body() syncMakeDto: SyncMakeDto): Promise<{ ino: number }> {
    return this.syncManager.make(req, syncMakeDto)
  }

  @Proppatch(`${SYNC_ROUTE.OPERATION}/*`)
  @SyncEnvironment()
  props(@Req() req: FastifySpaceRequest, @Body() syncPropsDto: SyncPropsDto): Promise<void> {
    return this.syncManager.props(req, syncPropsDto)
  }

  @Move(`${SYNC_ROUTE.OPERATION}/*`)
  @SyncEnvironment()
  move(@Req() req: FastifySpaceRequest, @Body() syncCopyMoveDto: SyncCopyMoveDto): Promise<void> {
    return this.syncManager.copyMove(req, syncCopyMoveDto, true)
  }

  @Copy(`${SYNC_ROUTE.OPERATION}/*`)
  @SyncEnvironment()
  copy(@Req() req: FastifySpaceRequest, @Body() syncCopyMoveDto: SyncCopyMoveDto): Promise<{ ino: number; mtime: number }> {
    return this.syncManager.copyMove(req, syncCopyMoveDto, false)
  }

  @Delete(`${SYNC_ROUTE.OPERATION}/*`)
  @SyncEnvironment()
  delete(@Req() req: FastifySpaceRequest): Promise<void> {
    return this.syncManager.delete(req)
  }
}
