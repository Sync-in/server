/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Request, Res, StreamableFile, UseInterceptors } from '@nestjs/common'
import { FastifyReply } from 'fastify'
import { ContextInterceptor } from '../../infrastructure/context/interceptors/context.interceptor'
import { SkipSpaceGuard } from '../spaces/decorators/space-skip-guard.decorator'
import { GetSpace } from '../spaces/decorators/space.decorator'
import { FastifySpaceRequest } from '../spaces/interfaces/space-request.interface'
import { SpaceEnv } from '../spaces/models/space-env.model'
import { GetUser } from '../users/decorators/user.decorator'
import { UserModel } from '../users/models/user.model'
import { FILE_MODE } from './constants/operations'
import { API_FILES_ONLY_OFFICE, FILES_ROUTE } from './constants/routes'
import { OnlyOfficeEnvironment } from './decorators/only-office-environment.decorator'
import { OnlyOfficeReqConfig } from './interfaces/only-office-config.interface'
import { FilesMethods } from './services/files-methods.service'
import { FilesOnlyOfficeManager } from './services/files-only-office-manager.service'

@Controller(API_FILES_ONLY_OFFICE)
@OnlyOfficeEnvironment()
export class FilesOnlyOfficeController {
  constructor(
    private readonly filesOnlyOfficeManager: FilesOnlyOfficeManager,
    private readonly filesMethods: FilesMethods
  ) {}

  @Get(`${FILES_ROUTE.ONLY_OFFICE_SETTINGS}/*`)
  @UseInterceptors(ContextInterceptor)
  onlyOfficeSettings(
    @GetUser() user: UserModel,
    @GetSpace() space: SpaceEnv,
    @Query('mode') mode: FILE_MODE = FILE_MODE.VIEW,
    @Request() req: FastifySpaceRequest
  ): Promise<OnlyOfficeReqConfig> {
    return this.filesOnlyOfficeManager.getSettings(user, space, mode, req)
  }

  @Get(`${FILES_ROUTE.ONLY_OFFICE_DOCUMENT}/*`)
  onlyOfficeDocument(@Request() req: FastifySpaceRequest, @Res({ passthrough: true }) res: FastifyReply): Promise<StreamableFile> {
    return this.filesMethods.headOrGet(req, res)
  }

  @Post(`${FILES_ROUTE.ONLY_OFFICE_CALLBACK}/*`)
  @HttpCode(HttpStatus.OK)
  onlyOfficeCallBack(@GetUser() user: UserModel, @GetSpace() space: SpaceEnv, @Body('token') token: string, @Query('fid') fileId: string) {
    return this.filesOnlyOfficeManager.callBack(user, space, token, fileId)
  }

  @Get(FILES_ROUTE.ONLY_OFFICE_STATUS)
  @SkipSpaceGuard()
  onlyOfficeStatus(): { enabled: boolean } {
    return this.filesOnlyOfficeManager.getStatus()
  }
}
