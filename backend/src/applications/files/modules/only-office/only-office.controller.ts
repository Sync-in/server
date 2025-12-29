/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Body, Controller, Get, HttpCode, HttpStatus, Post, Request, Res, StreamableFile, UseInterceptors } from '@nestjs/common'
import { FastifyReply } from 'fastify'
import { ContextInterceptor } from '../../../../infrastructure/context/interceptors/context.interceptor'
import { SPACE_OPERATION } from '../../../spaces/constants/spaces'
import { OverrideSpacePermission } from '../../../spaces/decorators/space-override-permission.decorator'
import { GetSpace } from '../../../spaces/decorators/space.decorator'
import { FastifySpaceRequest } from '../../../spaces/interfaces/space-request.interface'
import { SpaceEnv } from '../../../spaces/models/space-env.model'
import { GetUser } from '../../../users/decorators/user.decorator'
import { UserModel } from '../../../users/models/user.model'
import { FilesMethods } from '../../services/files-methods.service'
import { OnlyOfficeEnvironment } from './only-office-environment.decorator'
import { OnlyOfficeManager } from './only-office-manager.service'
import type { OnlyOfficeReqDto } from './only-office.dtos'
import { API_ONLY_OFFICE, ONLY_OFFICE_ROUTE } from './only-office.routes'

@Controller(API_ONLY_OFFICE)
@OnlyOfficeEnvironment()
export class OnlyOfficeController {
  constructor(
    private readonly filesMethods: FilesMethods,
    private readonly filesOnlyOfficeManager: OnlyOfficeManager
  ) {}

  @Get(`${ONLY_OFFICE_ROUTE.SETTINGS}/*`)
  @UseInterceptors(ContextInterceptor)
  onlyOfficeSettings(@Request() req: FastifySpaceRequest): Promise<OnlyOfficeReqDto> {
    return this.filesOnlyOfficeManager.getSettings(req.user, req.space, req)
  }

  @Get(`${ONLY_OFFICE_ROUTE.DOCUMENT}/*`)
  onlyOfficeDocument(@Request() req: FastifySpaceRequest, @Res({ passthrough: true }) res: FastifyReply): Promise<StreamableFile> {
    return this.filesMethods.headOrGet(req, res)
  }

  @Post(`${ONLY_OFFICE_ROUTE.CALLBACK}/*`)
  @OverrideSpacePermission(SPACE_OPERATION.MODIFY)
  @HttpCode(HttpStatus.OK)
  onlyOfficeCallBack(@GetUser() user: UserModel, @GetSpace() space: SpaceEnv, @Body('token') token: string) {
    return this.filesOnlyOfficeManager.callBack(user, space, token)
  }
}
