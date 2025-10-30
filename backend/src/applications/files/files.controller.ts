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
  Head,
  Logger,
  Move,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  Search,
  StreamableFile,
  UseGuards
} from '@nestjs/common'
import { FastifyReply } from 'fastify'
import { webpMimeType } from '../../common/image'
import { SkipSpaceGuard } from '../spaces/decorators/space-skip-guard.decorator'
import { SkipSpacePermissionsCheck } from '../spaces/decorators/space-skip-permissions.decorator'
import { GetSpace } from '../spaces/decorators/space.decorator'
import { SpaceGuard } from '../spaces/guards/space.guard'
import { FastifySpaceRequest } from '../spaces/interfaces/space-request.interface'
import { SpaceEnv } from '../spaces/models/space-env.model'
import { GetUser } from '../users/decorators/user.decorator'
import { UserModel } from '../users/models/user.model'
import { FILE_OPERATION } from './constants/operations'
import { FILES_ROUTE } from './constants/routes'
import { CompressFileDto, CopyMoveFileDto, DownloadFileDto, MakeFileDto, SearchFilesDto } from './dto/file-operations.dto'
import { FileTask } from './models/file-task'
import { FileContent } from './schemas/file-content.interface'
import { FileRecent } from './schemas/file-recent.interface'
import { FilesMethods } from './services/files-methods.service'
import { FilesRecents } from './services/files-recents.service'
import { FilesSearchManager } from './services/files-search-manager.service'
import { FilesTasksManager } from './services/files-tasks-manager.service'

@Controller(FILES_ROUTE.BASE)
@UseGuards(SpaceGuard)
export class FilesController {
  private readonly logger = new Logger(FilesController.name)

  constructor(
    private readonly filesMethods: FilesMethods,
    private readonly filesTasksManager: FilesTasksManager,
    private readonly filesRecents: FilesRecents,
    private readonly filesSearch: FilesSearchManager
  ) {}

  // OPERATIONS

  @Head(`${FILES_ROUTE.OPERATION}/*`)
  async head(@Req() req: FastifySpaceRequest, @Res({ passthrough: true }) res: FastifyReply): Promise<StreamableFile> {
    return this.filesMethods.headOrGet(req, res)
  }

  @Get(`${FILES_ROUTE.OPERATION}/*`)
  async download(@Req() req: FastifySpaceRequest, @Res({ passthrough: true }) res: FastifyReply): Promise<StreamableFile> {
    return this.filesMethods.headOrGet(req, res)
  }

  @Post(`${FILES_ROUTE.OPERATION}/${FILE_OPERATION.MAKE}/*`)
  async make(@GetUser() user: UserModel, @GetSpace() space: SpaceEnv, @Body() makeFileDto: MakeFileDto): Promise<void> {
    return this.filesMethods.make(user, space, makeFileDto)
  }

  @Post(`${FILES_ROUTE.OPERATION}/${FILE_OPERATION.UPLOAD}/*`)
  async upload(@Req() req: FastifySpaceRequest, @Res({ passthrough: true }) res: FastifyReply): Promise<void> {
    return this.filesMethods.upload(req, res)
  }

  @Copy(`${FILES_ROUTE.OPERATION}/*`)
  async copy(
    @GetUser() user: UserModel,
    @GetSpace() space: SpaceEnv,
    @Body() copyMoveFileDto: CopyMoveFileDto
  ): Promise<{
    path: string
    name: string
  }> {
    return this.filesMethods.copy(user, space, copyMoveFileDto)
  }

  @Move(`${FILES_ROUTE.OPERATION}/*`)
  async move(
    @GetUser() user: UserModel,
    @GetSpace() space: SpaceEnv,
    @Body() copyMoveFileDto: CopyMoveFileDto
  ): Promise<{
    path: string
    name: string
  }> {
    return this.filesMethods.move(user, space, copyMoveFileDto)
  }

  @Delete(`${FILES_ROUTE.OPERATION}/*`)
  async delete(@GetUser() user: UserModel, @GetSpace() space: SpaceEnv): Promise<void> {
    return this.filesMethods.delete(user, space)
  }

  @Get(`${FILES_ROUTE.OPERATION}/${FILE_OPERATION.THUMBNAIL}/*`)
  async genThumbnail(
    @GetSpace() space: SpaceEnv,
    @Query('size', new ParseIntPipe({ optional: true })) size = 256,
    @Res() res: FastifyReply
  ): Promise<StreamableFile> {
    if (size > 1024) size = 1024
    const thumb = await this.filesMethods.genThumbnail(space, size)
    res.type(webpMimeType)
    return res.send(thumb)
  }

  // TASKS OPERATIONS

  @Post(`${FILES_ROUTE.TASK_OPERATION}/${FILE_OPERATION.DOWNLOAD}/*`)
  async downloadFromUrlAsTask(@GetUser() user: UserModel, @GetSpace() space: SpaceEnv, @Body() downloadFileDto: DownloadFileDto): Promise<FileTask> {
    return this.filesTasksManager.createTask(FILE_OPERATION.DOWNLOAD, user, space, downloadFileDto, this.filesMethods.downloadFromUrl.name)
  }

  @Post(`${FILES_ROUTE.TASK_OPERATION}/${FILE_OPERATION.COMPRESS}/*`)
  @SkipSpacePermissionsCheck()
  // Compression could be used to download files, permission is checked later
  async compressAsTask(@Req() req: FastifySpaceRequest, @Body() compressFileDto: CompressFileDto): Promise<FileTask> {
    if (compressFileDto.compressInDirectory) {
      SpaceGuard.checkPermissions(req, this.logger)
    }
    return this.filesTasksManager.createTask(FILE_OPERATION.COMPRESS, req.user, req.space, compressFileDto, this.filesMethods.compress.name)
  }

  @Post(`${FILES_ROUTE.TASK_OPERATION}/${FILE_OPERATION.DECOMPRESS}/*`)
  async decompressAsTask(@GetUser() user: UserModel, @GetSpace() space: SpaceEnv): Promise<FileTask> {
    return this.filesTasksManager.createTask(FILE_OPERATION.DECOMPRESS, user, space, null, this.filesMethods.decompress.name)
  }

  @Copy(`${FILES_ROUTE.TASK_OPERATION}/*`)
  async copyAsTask(@GetUser() user: UserModel, @GetSpace() space: SpaceEnv, @Body() copyMoveFileDto: CopyMoveFileDto): Promise<FileTask> {
    return this.filesTasksManager.createTask(FILE_OPERATION.COPY, user, space, copyMoveFileDto, this.filesMethods.copy.name)
  }

  @Move(`${FILES_ROUTE.TASK_OPERATION}/*`)
  async moveAsTask(@GetUser() user: UserModel, @GetSpace() space: SpaceEnv, @Body() copyMoveFileDto: CopyMoveFileDto): Promise<FileTask> {
    return this.filesTasksManager.createTask(FILE_OPERATION.MOVE, user, space, copyMoveFileDto, this.filesMethods.move.name)
  }

  @Delete(`${FILES_ROUTE.TASK_OPERATION}/*`)
  async deleteAsTask(@GetUser() user: UserModel, @GetSpace() space: SpaceEnv): Promise<FileTask> {
    return this.filesTasksManager.createTask(FILE_OPERATION.DELETE, user, space, null, this.filesMethods.delete.name)
  }

  // RECENT FILES

  @Get(FILES_ROUTE.RECENTS)
  @SkipSpaceGuard()
  getRecents(@GetUser() user: UserModel, @Query('limit') limit: number = 10): Promise<FileRecent[]> {
    return this.filesRecents.getRecents(user, limit)
  }

  // SEARCH FILES

  @Search(FILES_ROUTE.SEARCH)
  @SkipSpaceGuard()
  search(@GetUser() user: UserModel, @Body() search: SearchFilesDto): Promise<FileContent[]> {
    return this.filesSearch.search(user, search)
  }
}
