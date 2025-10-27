/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpException, HttpStatus, Injectable, Logger, StreamableFile } from '@nestjs/common'
import { FastifyReply } from 'fastify'
import path from 'node:path'
import { pngMimeType } from '../../../common/image'
import { FastifySpaceRequest } from '../../spaces/interfaces/space-request.interface'
import { SpaceEnv } from '../../spaces/models/space-env.model'
import { SpacesManager } from '../../spaces/services/spaces-manager.service'
import { UserModel } from '../../users/models/user.model'
import { FILE_OPERATION } from '../constants/operations'
import { CompressFileDto, CopyMoveFileDto, DownloadFileDto, MakeFileDto } from '../dto/file-operations.dto'
import { FileError } from '../models/file-error'
import { LockConflict } from '../models/file-lock-error'
import { checkFileName, dirName, fileName, isPathExists, sanitizeName } from '../utils/files'
import { SendFile } from '../utils/send-file'
import { FilesManager } from './files-manager.service'

@Injectable()
export class FilesMethods {
  private readonly logger = new Logger(FilesMethods.name)

  constructor(
    private readonly spacesManager: SpacesManager,
    private readonly filesManager: FilesManager
  ) {}

  async headOrGet(req: FastifySpaceRequest, res: FastifyReply): Promise<StreamableFile> {
    const sendFile: SendFile = this.filesManager.sendFileFromSpace(req.space)
    try {
      await sendFile.checks()
      return await sendFile.stream(req, res)
    } catch (e) {
      this.handleError(req.space, req.method, e)
    }
  }

  async upload(req: FastifySpaceRequest, res: FastifyReply): Promise<void> {
    try {
      await this.filesManager.saveMultipart(req.user, req.space, req)
    } catch (e) {
      // if error we need to close the stream
      // req.raw.destroy()
      this.logger.error(`${this.upload.name} - unable to ${FILE_OPERATION.UPLOAD} ${req.space.url} : ${e}`)
      return res
        .header('Connection', 'close')
        .status(e.httpCode || 500)
        .send({ message: e.message })
    }
  }

  async make(user: UserModel, space: SpaceEnv, makeFileDto: MakeFileDto): Promise<void> {
    try {
      if (makeFileDto.type === 'directory') {
        return await this.filesManager.mkDir(user, space)
      } else {
        return await this.filesManager.mkFile(user, space, false, true, true)
      }
    } catch (e) {
      this.handleError(space, `${FILE_OPERATION.MAKE} ${makeFileDto.type}`, e)
    }
  }

  copy(
    user: UserModel,
    space: SpaceEnv,
    copyMoveFileDto: CopyMoveFileDto
  ): Promise<{
    path: string
    name: string
  }> {
    return this.copyMove(user, space, copyMoveFileDto, false)
  }

  move(
    user: UserModel,
    space: SpaceEnv,
    copyMoveFileDto: CopyMoveFileDto
  ): Promise<{
    path: string
    name: string
  }> {
    return this.copyMove(user, space, copyMoveFileDto, true)
  }

  async delete(user: UserModel, space: SpaceEnv): Promise<void> {
    try {
      return await this.filesManager.delete(user, space)
    } catch (e) {
      this.handleError(space, FILE_OPERATION.DELETE, e)
    }
  }

  async downloadFromUrl(user: UserModel, space: SpaceEnv, downloadDto: DownloadFileDto): Promise<void> {
    checkFileName(space.realPath)
    try {
      return await this.filesManager.downloadFromUrl(user, space, downloadDto.url)
    } catch (e) {
      this.handleError(space, FILE_OPERATION.DOWNLOAD, e)
    }
  }

  async compress(user: UserModel, space: SpaceEnv, compressFileDto: CompressFileDto): Promise<void> {
    compressFileDto.name = checkFileName(space.realPath)
    try {
      for (const f of compressFileDto.files) {
        // sanitize file name
        f.name = sanitizeName(f.name)
        // handles the case where the file is an anchored file
        let baseSpace: SpaceEnv
        if (f.path) {
          baseSpace = await this.spacesManager.spaceEnv(user, f.path.split('/'))
          f.path = baseSpace.realPath
        } else {
          if (f.rootAlias) {
            baseSpace = await this.spacesManager.spaceEnv(user, path.join(dirName(space.url), f.rootAlias).split('/'))
            f.path = baseSpace.realPath
          } else {
            baseSpace = space
            f.path = path.resolve(dirName(space.realPath), f.name)
          }
        }
        // prevent path traversal
        if (!f.path.startsWith(baseSpace.realBasePath)) {
          return this.handleError(space, FILE_OPERATION.COMPRESS, new FileError(HttpStatus.FORBIDDEN, `${f.name} not allowed`))
        }
        if (!(await isPathExists(f.path))) {
          return this.handleError(space, FILE_OPERATION.COMPRESS, new FileError(HttpStatus.NOT_FOUND, `${f.name} does not exist`))
        }
      }
      return await this.filesManager.compress(user, space, compressFileDto)
    } catch (e) {
      this.handleError(space, FILE_OPERATION.COMPRESS, e)
    }
  }

  async decompress(user: UserModel, space: SpaceEnv): Promise<void> {
    try {
      return await this.filesManager.decompress(user, space)
    } catch (e) {
      this.handleError(space, FILE_OPERATION.DECOMPRESS, e)
    }
  }

  async genThumbnail(space: SpaceEnv, size: number): Promise<StreamableFile> {
    try {
      const pngStream = await this.filesManager.generateThumbnail(space, size)
      return new StreamableFile(pngStream, { type: pngMimeType })
    } catch (e) {
      this.handleError(space, this.genThumbnail.name, e)
    }
  }

  private async copyMove(
    user: UserModel,
    space: SpaceEnv,
    copyMoveFileDto: CopyMoveFileDto,
    isMove: boolean
  ): Promise<{
    path: string
    name: string
  }> {
    const dstUrl = path.join(copyMoveFileDto.dstDirectory, copyMoveFileDto.dstName ? copyMoveFileDto.dstName : fileName(space.realPath))
    let dstSpace: SpaceEnv
    try {
      dstSpace = await this.spacesManager.spaceEnv(user, dstUrl.split('/'))
      await this.filesManager.copyMove(user, space, dstSpace, isMove)
    } catch (e) {
      this.handleError(space, isMove ? FILE_OPERATION.MOVE : FILE_OPERATION.COPY, e, dstSpace)
    }
    return { path: dirName(dstUrl), name: fileName(dstUrl) }
  }

  private handleError(space: SpaceEnv, action: string, e: any, dstSpace?: SpaceEnv) {
    this.logger.error(`unable to ${action} ${space.url}${dstSpace?.url ? ` -> ${dstSpace.url}` : ''} : ${e}`)
    const errorMsg = e.message.split(',')[0]
    if (e instanceof LockConflict) {
      throw new HttpException('The file is locked', HttpStatus.LOCKED)
    } else if (e instanceof FileError) {
      throw new HttpException(errorMsg, e.httpCode)
    }
    throw new HttpException(errorMsg, HttpStatus.INTERNAL_SERVER_ERROR)
  }
}
