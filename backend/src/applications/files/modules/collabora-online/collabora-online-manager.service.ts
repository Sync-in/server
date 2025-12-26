/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { FastifyReply } from 'fastify'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { convertHumanTimeToSeconds } from '../../../../common/functions'
import { configuration } from '../../../../configuration/config.environment'
import { ContextManager } from '../../../../infrastructure/context/services/context-manager.service'
import { SPACE_OPERATION } from '../../../spaces/constants/spaces'
import type { SpaceEnv } from '../../../spaces/models/space-env.model'
import { haveSpaceEnvPermissions } from '../../../spaces/utils/permissions'
import type { UserModel } from '../../../users/models/user.model'
import { getAvatarBase64 } from '../../../users/utils/avatar'
import { DEPTH, LOCK_SCOPE } from '../../../webdav/constants/webdav'
import { WebDAVLock } from '../../../webdav/interfaces/webdav.interface'
import { FILE_MODE } from '../../constants/operations'
import { FilesLockManager } from '../../services/files-lock-manager.service'
import {
  copyFileContent,
  fileName,
  fileSize,
  genEtag,
  genUniqHashFromFileDBProps,
  isPathExists,
  isPathIsDir,
  removeFiles,
  uniqueFilePathFromDir,
  writeFromStream
} from '../../utils/files'
import {
  COLLABORA_HEADERS,
  COLLABORA_LOCK_ACTION,
  COLLABORA_ONLINE_EXTENSIONS,
  COLLABORA_OWNER_LOCK,
  COLLABORA_TOKEN_QUERY_PARAM_NAME,
  COLLABORA_URI,
  COLLABORA_WOPI_SRC_QUERY_PARAM_NAME
} from './collabora-online.constants'
import { CollaboraOnlineReqDto, CollaboraSaveDocumentDto } from './collabora-online.dtos'
import { CollaboraOnlineCheckFileInfo, FastifyCollaboraOnlineSpaceRequest, JwtCollaboraOnlinePayload } from './collabora-online.interface'
import { API_COLLABORA_ONLINE_FILES } from './collabora-online.routes'

@Injectable()
export class CollaboraOnlineManager {
  private logger = new Logger(CollaboraOnlineManager.name)
  private readonly externalCollaboraOnlineServer = configuration.applications.files.collabora.externalServer || null
  private readonly expiration = convertHumanTimeToSeconds(configuration.auth.token.refresh.expiration)

  constructor(
    private readonly contextManager: ContextManager,
    private readonly jwt: JwtService,
    private readonly filesLockManager: FilesLockManager
  ) {}

  async getSettings(user: UserModel, space: SpaceEnv): Promise<CollaboraOnlineReqDto> {
    await this.checkSpace(space)
    const fileExtension = path.extname(space.realPath).slice(1)
    if (!COLLABORA_ONLINE_EXTENSIONS.has(fileExtension)) {
      throw new HttpException('Document not supported', HttpStatus.BAD_REQUEST)
    }
    const mode: FILE_MODE = haveSpaceEnvPermissions(space, SPACE_OPERATION.MODIFY) ? FILE_MODE.EDIT : FILE_MODE.VIEW
    if (mode === FILE_MODE.EDIT) {
      // Check lock conflicts
      try {
        await this.filesLockManager.checkConflicts(space.dbFile, DEPTH.RESOURCE, { userId: user.id, lockScope: LOCK_SCOPE.SHARED })
      } catch {
        throw new HttpException('The file is locked', HttpStatus.LOCKED)
      }
    }
    const dbFileHash = genUniqHashFromFileDBProps(space.dbFile)
    const authToken: string = await this.genAuthToken(user, space, dbFileHash)
    return { documentServerUrl: this.getDocumentUrl(dbFileHash, authToken), mode: mode }
  }

  async checkFileInfo(req: FastifyCollaboraOnlineSpaceRequest): Promise<CollaboraOnlineCheckFileInfo> {
    const fStats = await fs.stat(req.space.realPath)
    return {
      BaseFileName: fileName(req.space.realPath),
      Version: genEtag(null, req.space.realPath, false),
      OwnerId: `${req.space.dbFile.ownerId || req.user.id}`,
      Size: fStats.size,
      LastModifiedTime: fStats.mtime.toISOString(),
      UserId: `${req.user.id}`,
      UserFriendlyName: `${req.user.fullName} (${req.user.email})`,
      ReadOnly: false,
      UserExtraInfo: { avatar: await getAvatarBase64(req.user.login) },
      UserCanNotWriteRelative: true,
      UserCanWrite: haveSpaceEnvPermissions(req.space, SPACE_OPERATION.MODIFY),
      UserCanRename: false,
      SupportsUpdate: true,
      SupportsRename: false,
      SupportsExport: true,
      SupportsCoauth: true,
      SupportsLocks: true,
      SupportsGetLock: true
    } satisfies CollaboraOnlineCheckFileInfo
  }

  async saveDocument(req: FastifyCollaboraOnlineSpaceRequest): Promise<CollaboraSaveDocumentDto> {
    await this.checkSpace(req.space)
    await this.checkTimeStampFromHeaders(req)
    const tmpFilePath = await uniqueFilePathFromDir(path.join(os.tmpdir(), fileName(req.space.realPath)))
    try {
      await writeFromStream(tmpFilePath, req.raw)
    } catch (e) {
      throw new Error(`unable to save document : ${e.message}`)
    }
    // try to verify the downloaded size
    const contentLength = parseInt(req.headers['content-length'], 10)
    if (!isNaN(contentLength) && contentLength !== 0) {
      const tmpFileSize = await fileSize(tmpFilePath)
      if (tmpFileSize !== contentLength) {
        this.logger.error(`${this.saveDocument.name} - document size differs (${tmpFileSize} != ${contentLength})`)
        throw new HttpException('Size Mismatch', HttpStatus.BAD_REQUEST)
      }
    } else if (contentLength === 0) {
      this.logger.warn(`${this.saveDocument.name} - content length is 0 : ${req.space.url}`)
    }
    // copy contents to avoid inode changes (dbFileHash in some cases)
    try {
      // todo: versioning
      await copyFileContent(tmpFilePath, req.space.realPath)
      await removeFiles(tmpFilePath)
      const fStats = await fs.stat(req.space.realPath)
      return { LastModifiedTime: fStats.mtime.toISOString() } satisfies CollaboraSaveDocumentDto
    } catch (e) {
      this.logger.error(`${this.saveDocument.name} - unable to save document: ${e}`)
      throw new HttpException('Unable to save document', HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  async manageLock(req: FastifyCollaboraOnlineSpaceRequest, res: FastifyReply) {
    const lockAction = req.headers[COLLABORA_HEADERS.Action] as COLLABORA_LOCK_ACTION
    switch (lockAction) {
      case COLLABORA_LOCK_ACTION.LOCK: {
        const reqLockToken = this.lockTokenFromHeaders(req)
        const currentLock = await this.filesLockManager.isLockedWithToken(reqLockToken, req.space.dbFile.path)
        if (currentLock) {
          await this.filesLockManager.refreshLockTimeout(currentLock, this.expiration)
          break
        }
        const [ok, fileLock] = await this.filesLockManager.create(
          req.user,
          req.space.dbFile,
          DEPTH.RESOURCE,
          {
            lockroot: null,
            locktoken: reqLockToken,
            lockscope: LOCK_SCOPE.SHARED, // Collabora uses one lock for the session
            owner: `${COLLABORA_OWNER_LOCK} - ${req.user.fullName} (${req.user.email})`
          } satisfies WebDAVLock,
          this.expiration
        )
        if (!ok) {
          this.lockConflict(res, fileLock.davLock.locktoken)
          return
        }
        break
      }
      case COLLABORA_LOCK_ACTION.UNLOCK: {
        const reqLockToken = this.lockTokenFromHeaders(req)
        const currentLock = await this.filesLockManager.isLockedWithToken(reqLockToken, req.space.dbFile.path)
        if (currentLock) {
          await this.filesLockManager.removeLock(currentLock.key)
        } else {
          throw new HttpException('Lock not found', HttpStatus.CONFLICT)
        }
        break
      }
      case COLLABORA_LOCK_ACTION.GET_LOCK: {
        const lock = await this.filesLockManager.getLocksByPath(req.space.dbFile)
        if (lock.length) {
          res.header(COLLABORA_HEADERS.LockToken, lock[0].davLock.locktoken)
        }
        break
      }
      case COLLABORA_LOCK_ACTION.REFRESH_LOCK: {
        const reqLockToken = this.lockTokenFromHeaders(req)
        const currentLock = await this.filesLockManager.isLockedWithToken(reqLockToken, req.space.dbFile.path)
        if (currentLock) {
          await this.filesLockManager.refreshLockTimeout(currentLock, this.expiration)
        } else {
          throw new HttpException('Lock not found', HttpStatus.CONFLICT)
        }
        break
      }
      default:
        this.logger.warn(`${this.manageLock.name} - Unknown lock action: ${lockAction}`)
        throw new HttpException('Unknown lock action', HttpStatus.BAD_REQUEST)
    }
  }

  private getDocumentUrl(dbFileHash: string, token: string): string {
    const collaboraBase = this.externalCollaboraOnlineServer || this.contextManager.headerOriginUrl()
    // Example:
    // - external: https://collabora.domain.com
    // - internal (via nginx proxy): https://domain.com/collabora

    const editorUrl = new URL(COLLABORA_URI, collaboraBase)
    // → /browser/dist/cool.html

    const wopiSrcUrl = new URL(`${API_COLLABORA_ONLINE_FILES}/${dbFileHash}`, this.contextManager.headerOriginUrl())
    // → https://domain.com/wopi/files/888

    editorUrl.searchParams.set(COLLABORA_WOPI_SRC_QUERY_PARAM_NAME, wopiSrcUrl.toString())
    editorUrl.searchParams.set(COLLABORA_TOKEN_QUERY_PARAM_NAME, token)

    return editorUrl.toString()
  }

  private genAuthToken(user: UserModel, space: SpaceEnv, dbFileHash: string): Promise<string> {
    // use refresh expiration to allow long sessions
    return this.jwt.signAsync(
      {
        identity: {
          id: user.id,
          login: user.login,
          email: user.email,
          fullName: user.fullName,
          language: user.language,
          role: user.role,
          applications: user.applications,
          spaceUrl: space.url,
          dbFileHash: dbFileHash
        } satisfies JwtCollaboraOnlinePayload
      },
      {
        secret: configuration.auth.token.access.secret,
        expiresIn: this.expiration
      }
    )
  }

  private lockTokenFromHeaders(req: FastifyCollaboraOnlineSpaceRequest): string {
    const lockToken = req.headers[COLLABORA_HEADERS.LockToken] as string
    if (!lockToken) {
      throw new HttpException('Lock token is required', HttpStatus.CONFLICT)
    }
    return lockToken
  }

  private lockConflict(res: FastifyReply, currentLockToken: string) {
    res.header(COLLABORA_HEADERS.LockToken, currentLockToken)
    throw new HttpException('The file is locked', HttpStatus.CONFLICT)
  }

  private async checkTimeStampFromHeaders(req: FastifyCollaboraOnlineSpaceRequest) {
    const timestamp = req.headers[COLLABORA_HEADERS.Timestamp] as string
    if (!timestamp) {
      return
    }
    const fStats = await fs.stat(req.space.realPath)
    if (fStats.mtime.toISOString() !== timestamp) {
      throw new HttpException({ LOOLStatusCode: 1010 }, HttpStatus.CONFLICT)
    }
  }

  private async checkSpace(space: SpaceEnv) {
    if (!(await isPathExists(space.realPath))) {
      throw new HttpException('Document not found', HttpStatus.NOT_FOUND)
    }
    if (await isPathIsDir(space.realPath)) {
      throw new HttpException('Document must be a file', HttpStatus.BAD_REQUEST)
    }
  }
}
