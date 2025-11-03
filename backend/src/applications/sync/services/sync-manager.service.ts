/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpException, HttpStatus, Injectable, Logger, StreamableFile } from '@nestjs/common'
import { FastifyReply } from 'fastify'
import fs from 'fs/promises'
import { Dirent, Stats } from 'node:fs'
import path from 'node:path'
import { regExpPathPattern } from '../../../common/functions'
import { FILE_OPERATION } from '../../files/constants/operations'
import { FileError } from '../../files/models/file-error'
import { LockConflict } from '../../files/models/file-lock-error'
import { FilesManager } from '../../files/services/files-manager.service'
import { checksumFile, isPathExists, isPathIsDir, removeFiles, touchFile } from '../../files/utils/files'
import { SendFile } from '../../files/utils/send-file'
import { ParseDiffContext } from '../../spaces/interfaces/space-diff.interface'
import { FastifySpaceRequest } from '../../spaces/interfaces/space-request.interface'
import { SpaceEnv } from '../../spaces/models/space-env.model'
import { SpacesManager } from '../../spaces/services/spaces-manager.service'
import { UserModel } from '../../users/models/user.model'
import { F_SPECIAL_STAT, F_STAT, SYNC_CHECKSUM_ALG, SYNC_DIFF_DONE } from '../constants/sync'
import { SyncCopyMoveDto, SyncDiffDto, SyncMakeDto, SyncPropsDto } from '../dtos/sync-operations.dto'
import { SyncUploadDto } from '../dtos/sync-upload.dto'
import { SyncFileSpecialStats, SyncFileStats } from '../interfaces/sync-diff.interface'
import { SyncPathSettings } from '../interfaces/sync-path.interface'
import { getTmpFilePath } from '../utils/functions'
import { SYNC_PATH_TO_SPACE_SEGMENTS } from '../utils/routes'
import { SyncQueries } from './sync-queries.service'

@Injectable()
export class SyncManager {
  private readonly logger = new Logger(SyncManager.name)

  constructor(
    private readonly spacesManager: SpacesManager,
    private readonly filesManager: FilesManager,
    private readonly syncQueries: SyncQueries
  ) {}

  async download(req: FastifySpaceRequest, res: FastifyReply): Promise<StreamableFile> {
    const sendFile: SendFile = this.filesManager.sendFileFromSpace(req.space)
    try {
      await sendFile.checks()
      return await sendFile.stream(req, res)
    } catch (e) {
      this.handleError(req.space, req.method, e)
    }
  }

  async upload(req: FastifySpaceRequest, syncUploadDto: SyncUploadDto): Promise<{ ino: number }> {
    const tmpPath = getTmpFilePath(req.space.realPath)
    try {
      if (syncUploadDto.checksum) {
        const checksum = await this.filesManager.saveStream(req.user, req.space, req, { tmpPath: tmpPath, checksumAlg: SYNC_CHECKSUM_ALG })
        if (checksum !== syncUploadDto.checksum) {
          await removeFiles(tmpPath)
          this.handleError(req.space, req.method, new FileError(HttpStatus.BAD_REQUEST, 'checksums are not identical'))
        }
      } else {
        await this.filesManager.saveStream(req.user, req.space, req, { tmpPath: tmpPath })
      }
      const fileStats = await fs.stat(req.space.realPath)
      if (fileStats.size !== syncUploadDto.size) {
        await removeFiles(tmpPath)
        this.handleError(
          req.space,
          req.method,
          new FileError(HttpStatus.BAD_REQUEST, `sizes are not identical : ${fileStats.size} != ${syncUploadDto.size}`)
        )
      }
      // update mtime
      await touchFile(req.space.realPath, syncUploadDto.mtime)
      // return inode number
      return { ino: fileStats.ino }
    } catch (e) {
      this.handleError(req.space, req.method, e)
    }
  }

  async delete(req: FastifySpaceRequest): Promise<void> {
    try {
      return await this.filesManager.delete(req.user, req.space)
    } catch (e) {
      this.handleError(req.space, FILE_OPERATION.DELETE, e)
    }
  }

  async props(req: FastifySpaceRequest, syncPropsDto: SyncPropsDto): Promise<void> {
    try {
      await this.filesManager.touch(req.user, req.space, syncPropsDto.mtime, false)
    } catch (e) {
      this.handleError(req.space, FILE_OPERATION.TOUCH, e)
    }
  }

  async make(req: FastifySpaceRequest, syncMakeDto: SyncMakeDto): Promise<{ ino: number }> {
    try {
      if (syncMakeDto.type === 'directory') {
        await this.filesManager.mkDir(req.user, req.space, true)
      } else {
        await this.filesManager.mkFile(req.user, req.space, true)
      }
      await touchFile(req.space.realPath, syncMakeDto.mtime)
      return { ino: (await fs.stat(req.space.realPath)).ino }
    } catch (e) {
      this.handleError(req.space, `${FILE_OPERATION.MAKE} ${syncMakeDto.type}`, e)
    }
  }

  async copyMove(req: FastifySpaceRequest, syncCopyMoveDto: SyncCopyMoveDto, isMove: true): Promise<void>
  async copyMove(req: FastifySpaceRequest, syncCopyMoveDto: SyncCopyMoveDto, isMove: false): Promise<{ ino: number; mtime: number }>
  async copyMove(req: FastifySpaceRequest, syncCopyMoveDto: SyncCopyMoveDto, isMove: boolean): Promise<void | { ino: number; mtime: number }> {
    const dstSpace: SpaceEnv = await this.spacesManager.spaceEnv(req.user, SYNC_PATH_TO_SPACE_SEGMENTS(syncCopyMoveDto.destination))
    try {
      await this.filesManager.copyMove(req.user, req.space, dstSpace, isMove, true, true)
      if (!isMove) {
        if (syncCopyMoveDto.mtime) {
          // update mtime
          await touchFile(dstSpace.realPath, syncCopyMoveDto.mtime)
        }
        // return inode & mtime
        const stats = await fs.stat(dstSpace.realPath)
        return { ino: stats.ino, mtime: Math.floor(stats.mtime.getTime() / 1000) }
      }
    } catch (e) {
      this.handleError(req.space, isMove ? FILE_OPERATION.MOVE : FILE_OPERATION.COPY, e, dstSpace)
    }
  }

  async diff(user: UserModel, pathId: number, syncDiff: SyncDiffDto, res: FastifyReply): Promise<void> {
    if (!user.clientId) {
      throw new HttpException('Client id is missing', HttpStatus.BAD_REQUEST)
    }
    const syncPathSettings: SyncPathSettings = await this.syncQueries.getPathSettings(user.clientId, pathId)
    if (!syncPathSettings) {
      throw new HttpException('Path not found', HttpStatus.NOT_FOUND)
    }
    let space: SpaceEnv
    try {
      space = await this.spacesManager.spaceEnv(user, SYNC_PATH_TO_SPACE_SEGMENTS(syncPathSettings.remotePath))
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST)
    }
    if (!space) {
      throw new HttpException('Space not found', HttpStatus.NOT_FOUND)
    }
    if (space.quotaIsExceeded) {
      throw new HttpException('Storage quota exceeded', HttpStatus.INSUFFICIENT_STORAGE)
    }
    if (!(await isPathExists(space.realPath))) {
      throw new HttpException(`Remote path not found : ${syncPathSettings.remotePath}`, HttpStatus.NOT_FOUND)
    }
    if (!(await isPathIsDir(space.realPath))) {
      throw new HttpException('Remote path must be a directory', HttpStatus.BAD_REQUEST)
    }
    // start
    res.raw.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked'
    })
    try {
      for await (const f of this.parseSyncPath(space, syncDiff)) {
        res.raw.write(`${JSON.stringify(f)}\n`)
      }
      res.raw.write(SYNC_DIFF_DONE)
    } catch (e) {
      this.logger.error(`${this.diff.name} : ${e.message}`)
      res.raw.write(`${e.message}\n`)
      res.status(HttpStatus.INTERNAL_SERVER_ERROR)
    }
    res.raw.end()
  }

  private async *parseSyncPath(space: SpaceEnv, syncDiff: SyncDiffDto): AsyncGenerator<Record<string, SyncFileStats | SyncFileSpecialStats>> {
    const context: ParseDiffContext = {
      regexBasePath: regExpPathPattern(space.realPath),
      syncDiff: syncDiff
    }
    yield* this.parseFiles(space.realPath, context)
  }

  private async *parseFiles(dir: string, ctx: ParseDiffContext): AsyncGenerator<Record<string, SyncFileStats | SyncFileSpecialStats>> {
    try {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const realPath = path.join(entry.parentPath, entry.name)
        if (!entry.isDirectory() && !entry.isFile()) {
          this.logger.log(`${this.parseFiles.name} - ignore special file: ${realPath}`)
          continue
        }
        if (entry.isDirectory()) {
          const dirStats: Record<string, SyncFileStats | SyncFileSpecialStats> = await this.analyzeFile(entry, ctx)
          if (dirStats !== null) {
            yield dirStats
          }
          yield* this.parseFiles(realPath, ctx)
        } else {
          const fileStats: Record<string, SyncFileStats | SyncFileSpecialStats> = await this.analyzeFile(entry, ctx)
          if (fileStats !== null) {
            yield fileStats
          }
        }
      }
    } catch (e) {
      this.logger.error(`${this.parseFiles.name} - unable to parse directory : ${dir} : ${e}`)
      throw new Error('Unable to parse path')
    }
  }

  private async analyzeFile(entry: Dirent, ctx: ParseDiffContext): Promise<Record<string, SyncFileStats | SyncFileSpecialStats>> {
    if (ctx.syncDiff.defaultFilters.has(entry.name)) {
      return null
    }

    const realPath = path.join(entry.parentPath, entry.name)
    const filePath = realPath.replace(ctx.regexBasePath, '')

    let stats: Stats
    try {
      stats = await fs.stat(realPath)
    } catch (e) {
      this.logger.warn(`${this.analyzeFile.name} - unable to get file stats : ${realPath} : ${e}`)
      return { [filePath]: [F_SPECIAL_STAT.ERROR, e.toString()] }
    }

    if (ctx.syncDiff.pathFilters && ctx.syncDiff.pathFilters.test(filePath)) {
      this.logger.verbose(`${this.analyzeFile.name} - ignore filtered file : ${realPath}`)
      return { [filePath]: [F_SPECIAL_STAT.FILTERED, stats.isDirectory()] }
    }

    const fileStats: SyncFileStats = [
      stats.isDirectory(),
      stats.isDirectory() ? 0 : stats.size,
      Math.floor(stats.mtime.getTime() / 1000),
      stats.ino,
      null
    ]
    if (ctx.syncDiff.secureDiff && !fileStats[F_STAT.IS_DIR]) {
      try {
        await this.checkSumFile(ctx, filePath, realPath, fileStats)
      } catch (e) {
        this.logger.error(`${this.analyzeFile.name} - file error : ${realPath} - ${e}`)
        return { [filePath]: [F_SPECIAL_STAT.ERROR, e.toString()] }
      }
    }
    return { [filePath]: fileStats }
  }

  private async checkSumFile(ctx: ParseDiffContext, filePath: string, realPath: string, fileStats: SyncFileStats): Promise<void> {
    if (!ctx.syncDiff.firstSync && ctx.syncDiff.snapshot.has(filePath)) {
      const snapFileStats: SyncFileStats = ctx.syncDiff.snapshot.get(filePath)
      if (
        snapFileStats[F_STAT.CHECKSUM] &&
        snapFileStats[F_STAT.MTIME] == fileStats[F_STAT.MTIME] &&
        snapFileStats[F_STAT.SIZE] == fileStats[F_STAT.SIZE] &&
        snapFileStats[F_STAT.INO] == fileStats[F_STAT.INO]
      ) {
        fileStats[F_STAT.CHECKSUM] = snapFileStats[F_STAT.CHECKSUM]
        return
      }
    }
    fileStats[F_STAT.CHECKSUM] = await checksumFile(realPath, SYNC_CHECKSUM_ALG)
  }

  private handleError(space: SpaceEnv, action: string, e: any, dstSpace?: SpaceEnv) {
    this.logger.error(`unable to ${action} ${space.url}${dstSpace?.url ? ` -> ${dstSpace.url}` : ''} : ${e}`)
    // Remove the last part to avoid exposing the path
    const errorMsg = e.message.split(',')[0]
    if (e instanceof LockConflict) {
      throw new HttpException('The file is locked', HttpStatus.LOCKED)
    } else if (e instanceof FileError) {
      throw new HttpException(errorMsg, e.httpCode)
    }
    throw new HttpException(errorMsg, HttpStatus.INTERNAL_SERVER_ERROR)
  }
}
