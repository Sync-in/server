import { Controller, Get, HttpCode, HttpStatus, Post, Request, Res, StreamableFile, UseGuards, UseInterceptors } from '@nestjs/common'
import { type FastifyReply } from 'fastify'
import { ContextInterceptor } from '../../../../infrastructure/context/interceptors/context.interceptor.js'
import { SPACE_OPERATION } from '../../../spaces/constants/spaces.js'
import { OverrideSpacePermission } from '../../../spaces/decorators/space-override-permission.decorator.js'
import { SpaceGuard } from '../../../spaces/guards/space.guard.js'
import { type FastifySpaceRequest } from '../../../spaces/interfaces/space-request.interface.js'
import { FilesMethods } from '../../services/files-methods.service.js'
import { CollaboraOnlineEnvironment } from './collabora-online-environment.decorator.js'
import { CollaboraOnlineManager } from './collabora-online-manager.service.js'
import { CollaboraOnlineReqDto, CollaboraSaveDocumentDto } from './collabora-online.dtos.js'
import type { CollaboraOnlineCheckFileInfo } from './collabora-online.interface.js'
import { COLLABORA_ONLINE_ROUTE } from './collabora-online.routes.js'

@Controller(COLLABORA_ONLINE_ROUTE.BASE)
export class CollaboraOnlineController {
  constructor(
    private readonly filesMethods: FilesMethods,
    private readonly filesCollaboraOnlineService: CollaboraOnlineManager
  ) {}

  @Get(`${COLLABORA_ONLINE_ROUTE.SETTINGS}/*`)
  @UseGuards(SpaceGuard)
  @UseInterceptors(ContextInterceptor)
  collaboraOnlineSettings(@Request() req: FastifySpaceRequest): Promise<CollaboraOnlineReqDto> {
    return this.filesCollaboraOnlineService.getSettings(req.user, req.space)
  }

  @Get(`${COLLABORA_ONLINE_ROUTE.FILES}/:dbFileHash/${COLLABORA_ONLINE_ROUTE.CONTENTS}`)
  @CollaboraOnlineEnvironment()
  collaboraOnlineGetDocumentContent(
    @Request() req: FastifySpaceRequest,
    @Res({ passthrough: true }) res: FastifyReply
  ): Promise<StreamableFile | CollaboraOnlineCheckFileInfo> {
    return this.filesMethods.headOrGet(req, res)
  }

  @Get(`${COLLABORA_ONLINE_ROUTE.FILES}/:dbFileHash`)
  @CollaboraOnlineEnvironment()
  collaboraOnlineGetDocumentInfo(@Request() req: FastifySpaceRequest): Promise<StreamableFile | CollaboraOnlineCheckFileInfo> {
    return this.filesCollaboraOnlineService.checkFileInfo(req)
  }

  @Post(`${COLLABORA_ONLINE_ROUTE.FILES}/:dbFileHash/${COLLABORA_ONLINE_ROUTE.CONTENTS}`)
  @CollaboraOnlineEnvironment()
  @OverrideSpacePermission(SPACE_OPERATION.MODIFY)
  @HttpCode(HttpStatus.OK)
  collaboraOnlineSaveDocument(@Request() req: FastifySpaceRequest): Promise<CollaboraSaveDocumentDto> {
    return this.filesCollaboraOnlineService.saveDocument(req)
  }

  @Post(`${COLLABORA_ONLINE_ROUTE.FILES}/:dbFileHash`)
  @CollaboraOnlineEnvironment()
  @OverrideSpacePermission(SPACE_OPERATION.MODIFY)
  @HttpCode(HttpStatus.OK)
  collaboraOnlineManageLockOnDocument(@Request() req: FastifySpaceRequest, @Res({ passthrough: true }) res: FastifyReply): Promise<void> {
    return this.filesCollaboraOnlineService.manageLock(req, res)
  }
}
