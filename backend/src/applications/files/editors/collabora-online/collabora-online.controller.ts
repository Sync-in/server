import { Controller, Get, HttpCode, HttpStatus, Post, Request, Res, StreamableFile, UseGuards, UseInterceptors } from '@nestjs/common'
import { FastifyReply } from 'fastify'
import { ContextInterceptor } from '../../../../infrastructure/context/interceptors/context.interceptor'
import { SPACE_OPERATION } from '../../../spaces/constants/spaces'
import { OverrideSpacePermission } from '../../../spaces/decorators/space-override-permission.decorator'
import { SpaceGuard } from '../../../spaces/guards/space.guard'
import { FastifySpaceRequest } from '../../../spaces/interfaces/space-request.interface'
import { FilesMethods } from '../../services/files-methods.service'
import { CollaboraOnlineEnvironment } from './collabora-online-environment.decorator'
import { CollaboraOnlineManager } from './collabora-online-manager.service'
import { CollaboraOnlineReqDto, CollaboraSaveDocumentDto } from './collabora-online.dtos'
import type { CollaboraOnlineCheckFileInfo } from './collabora-online.interface'
import { COLLABORA_ONLINE_ROUTE } from './collabora-online.routes'

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
