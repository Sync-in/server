/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpService } from '@nestjs/axios'
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { AxiosResponse } from 'axios'
import https from 'https'
import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { SERVER_NAME } from '../../../app.constants'
import { JwtIdentityPayload } from '../../../authentication/interfaces/jwt-payload.interface'
import { convertHumanTimeToSeconds, generateShortUUID } from '../../../common/functions'
import { configuration } from '../../../configuration/config.environment'
import { Cache } from '../../../infrastructure/cache/services/cache.service'
import { ContextManager } from '../../../infrastructure/context/services/context-manager.service'
import { HTTP_METHOD } from '../../applications.constants'
import { SPACE_OPERATION } from '../../spaces/constants/spaces'
import { FastifySpaceRequest } from '../../spaces/interfaces/space-request.interface'
import type { SpaceEnv } from '../../spaces/models/space-env.model'
import { haveSpaceEnvPermissions } from '../../spaces/utils/permissions'
import type { UserModel } from '../../users/models/user.model'
import { UsersManager } from '../../users/services/users-manager.service'
import { DEPTH, LOCK_SCOPE } from '../../webdav/constants/webdav'
import { CACHE_ONLY_OFFICE } from '../constants/cache'
import {
  ONLY_OFFICE_CONVERT_ERROR,
  ONLY_OFFICE_CONVERT_EXTENSIONS,
  ONLY_OFFICE_EXTENSIONS,
  ONLY_OFFICE_INTERNAL_URI,
  ONLY_OFFICE_TOKEN_QUERY_PARAM_NAME
} from '../constants/only-office'
import { API_FILES_ONLY_OFFICE_CALLBACK, API_FILES_ONLY_OFFICE_DOCUMENT } from '../constants/routes'
import type { FileProps } from '../interfaces/file-props.interface'
import { OnlyOfficeCallBack, OnlyOfficeConfig, OnlyOfficeConvertForm, OnlyOfficeReqConfig } from '../interfaces/only-office-config.interface'
import { copyFileContent, fileSize, getProps, isPathExists, isPathIsDir, removeFiles, uniqueFilePathFromDir, writeFromStream } from '../utils/files'
import { FilesLockManager } from './files-lock-manager.service'
import { FilesQueries } from './files-queries.service'

@Injectable()
export class FilesOnlyOfficeManager {
  private logger = new Logger(FilesOnlyOfficeManager.name)
  private readonly externalOnlyOfficeServer = configuration.applications.files.onlyoffice.externalServer || null
  private readonly rejectUnauthorized: boolean = !configuration.applications.files.onlyoffice?.verifySSL
  private readonly convertUrl = this.externalOnlyOfficeServer ? `${this.externalOnlyOfficeServer}/ConvertService.ashx` : null
  private readonly expiration = convertHumanTimeToSeconds(configuration.auth.token.refresh.expiration)
  private readonly mobileRegex: RegExp = /android|webos|iphone|ipad|ipod|blackberry|windows phone|opera mini|iemobile|mobile/i

  constructor(
    private readonly http: HttpService,
    private readonly contextManager: ContextManager,
    private readonly cache: Cache,
    private readonly jwt: JwtService,
    private readonly usersManager: UsersManager,
    private readonly filesLockManager: FilesLockManager,
    private readonly filesQueries: FilesQueries
  ) {}

  getStatus(): { enabled: boolean } {
    return { enabled: configuration.applications.files.onlyoffice.enabled }
  }

  async getSettings(user: UserModel, space: SpaceEnv, mode: 'edit' | 'view', req: FastifySpaceRequest): Promise<OnlyOfficeReqConfig> {
    if (!(await isPathExists(space.realPath))) {
      throw new HttpException('Document not found', HttpStatus.NOT_FOUND)
    }
    if (await isPathIsDir(space.realPath)) {
      throw new HttpException('Document must be a file', HttpStatus.BAD_REQUEST)
    }
    const fileExtension = path.extname(space.realPath).slice(1)
    if (!ONLY_OFFICE_EXTENSIONS.VIEWABLE.has(fileExtension) && !ONLY_OFFICE_EXTENSIONS.EDITABLE.has(fileExtension)) {
      throw new HttpException('Document not supported', HttpStatus.BAD_REQUEST)
    }
    if (mode === 'edit' && (!ONLY_OFFICE_EXTENSIONS.EDITABLE.has(fileExtension) || !haveSpaceEnvPermissions(space, SPACE_OPERATION.MODIFY))) {
      mode = 'view'
    }
    if (mode === 'edit') {
      // check lock conflicts
      try {
        await this.filesLockManager.checkConflicts(space.dbFile, DEPTH.RESOURCE, { userId: user.id, lockScope: LOCK_SCOPE.SHARED })
      } catch {
        throw new HttpException('The file is locked', HttpStatus.LOCKED)
      }
    }
    const isMobile: boolean = this.mobileRegex.test(req.headers['user-agent'])
    const fileProps: FileProps = await getProps(space.realPath, space.dbFile.path)
    const fileId: string = ((await this.filesQueries.getSpaceFileId(fileProps, space.dbFile)) || fileProps.id).toString()
    const userToken: string = await this.genUserToken(user)
    const fileUrl = this.getDocumentUrl(space, userToken)
    const callBackUrl = this.getCallBackUrl(space, userToken, fileId)
    const config: OnlyOfficeReqConfig = await this.genConfiguration(user, space, mode, fileId, fileUrl, fileExtension, callBackUrl, isMobile)
    config.config.token = await this.genPayloadToken(config.config)
    return config
  }

  async callBack(user: UserModel, space: SpaceEnv, token: string, fileId: string) {
    const callBackData: OnlyOfficeCallBack = await this.jwt.verifyAsync(token, { secret: configuration.applications.files.onlyoffice.secret })
    try {
      switch (callBackData.status) {
        case 1:
          await this.checkFileLock(user, space, callBackData)
          this.logger.debug(`document is being edited : ${space.url}`)
          break
        case 2:
          await this.checkFileLock(user, space, callBackData)
          if (callBackData.notmodified) {
            this.logger.debug(`document was edited but closed with no changes : ${space.url}`)
          } else {
            this.logger.debug(`document was edited but not saved (let's do it) : ${space.url}`)
            await this.saveDocument(space, callBackData.url)
          }
          await this.removeDocumentKey(fileId, space)
          break
        case 3:
          this.logger.error(`document cannot be saved, an error has occurred (try to save it) : ${space.url}`)
          await this.saveDocument(space, callBackData.url)
          break
        case 4:
          await this.removeFileLock(user.id, space)
          await this.removeDocumentKey(fileId, space)
          this.logger.debug(`document was closed with no changes : ${space.url}`)
          break
        case 6:
          this.logger.debug(`document is edited but save was requested : ${space.url}`)
          await this.saveDocument(space, callBackData.url)
          break
        case 7:
          this.logger.error(`document cannot be force saved, an error has occurred (try to save it) : ${space.url}`)
          await this.saveDocument(space, callBackData.url)
          break
        default:
          this.logger.error('unhandled case')
      }
    } catch (e) {
      this.logger.error(`${this.callBack.name} - ${e.message} : ${space.url}`)
      return { error: e.message }
    }
    return { error: 0 }
  }

  private async genConfiguration(
    user: UserModel,
    space: SpaceEnv,
    mode: 'edit' | 'view',
    fileId: string,
    fileUrl: string,
    fileExtension: string,
    callBackUrl: string,
    isMobile: boolean
  ): Promise<OnlyOfficeReqConfig> {
    const documentType = ONLY_OFFICE_EXTENSIONS.EDITABLE.get(fileExtension) || ONLY_OFFICE_EXTENSIONS.VIEWABLE.get(fileExtension)
    return {
      documentServerUrl: this.externalOnlyOfficeServer || `${this.contextManager.get('headerOriginUrl')}${ONLY_OFFICE_INTERNAL_URI}`,
      config: {
        type: isMobile ? 'mobile' : 'desktop',
        height: '100%',
        width: '100%',
        documentType: documentType,
        document: {
          title: path.basename(space.relativeUrl),
          fileType: fileExtension,
          key: await this.getDocumentKey(fileId),
          permissions: {
            download: true,
            edit: mode === 'edit',
            changeHistory: false,
            comment: true,
            fillForms: true,
            print: true,
            review: mode === 'edit'
          },
          url: fileUrl
        },
        editorConfig: {
          mode: mode,
          lang: 'en',
          region: 'en',
          callbackUrl: callBackUrl,
          user: { id: user.id.toString(), name: `${user.fullName} (${user.email})`, image: await this.usersManager.getAvatarBase64(user.login) },
          coEditing: {
            mode: 'fast',
            change: true
          },
          embedded: {
            embedUrl: fileUrl,
            saveUrl: fileUrl,
            shareUrl: fileUrl,
            toolbarDocked: 'top'
          },
          customization: {
            about: false,
            autosave: false,
            forcesave: true,
            zoom: documentType === 'slide' ? 60 : 90,
            help: false,
            features: { featuresTips: false },
            plugins: false
          }
        }
      }
    }
  }

  private getDocumentUrl(space: SpaceEnv, token: string): string {
    // user refresh token is used here for long session
    return `${this.contextManager.get('headerOriginUrl')}${API_FILES_ONLY_OFFICE_DOCUMENT}/${space.url}?${ONLY_OFFICE_TOKEN_QUERY_PARAM_NAME}=${token}`
  }

  private getCallBackUrl(space: SpaceEnv, token: string, fileId: string): string {
    // user refresh token is used here for long session
    return `${this.contextManager.get('headerOriginUrl')}${API_FILES_ONLY_OFFICE_CALLBACK}/${space.url}?fid=${fileId}&${ONLY_OFFICE_TOKEN_QUERY_PARAM_NAME}=${token}`
  }

  private genPayloadToken(payload: OnlyOfficeConfig | OnlyOfficeConvertForm): Promise<string> {
    return this.jwt.signAsync(payload, { secret: configuration.applications.files.onlyoffice.secret, expiresIn: 60 })
  }

  private genUserToken(user: UserModel): Promise<string> {
    // use refresh expiration to allow long session
    return this.jwt.signAsync(
      {
        identity: {
          id: user.id,
          login: user.login,
          email: user.email,
          fullName: user.fullName,
          language: user.language,
          role: user.role,
          applications: user.applications
        } satisfies JwtIdentityPayload
      },
      {
        secret: configuration.auth.token.access.secret,
        expiresIn: this.expiration
      }
    )
  }

  private async checkFileLock(user: UserModel, space: SpaceEnv, callBackData: OnlyOfficeCallBack) {
    for (const action of callBackData.actions) {
      if (action.type === 0) {
        // disconnect
        await this.removeFileLock(parseInt(action.userid), space)
      } else if (action.type === 1) {
        // connect
        await this.genFileLock(user, space)
      }
    }
  }

  private async genFileLock(user: UserModel, space: SpaceEnv): Promise<void> {
    const [ok, _fileLock] = await this.filesLockManager.create(user, space.dbFile, DEPTH.RESOURCE, this.expiration, {
      lockroot: null,
      locktoken: null,
      lockscope: LOCK_SCOPE.SHARED,
      owner: `${SERVER_NAME} - ${user.fullName} (${user.email})`
    })
    if (!ok) {
      throw new Error('document is locked')
    }
  }

  private async removeFileLock(userId: number, space: SpaceEnv): Promise<void> {
    for (const lock of await this.filesLockManager.getLocksByPath(space.dbFile)) {
      if (lock.owner.id === userId) {
        await this.filesLockManager.removeLock(lock.key)
      }
    }
  }

  private async removeDocumentKey(fileId: string, space: SpaceEnv): Promise<void> {
    if (!(await this.filesLockManager.isPathLocked(space.dbFile))) {
      const cacheKey = this.getCacheKey(fileId)
      const r = await this.cache.del(cacheKey)
      this.logger.debug(`${this.removeDocumentKey.name} - ${cacheKey} ${r ? '' : 'not'} removed`)
    }
  }

  private async getDocumentKey(fileId: string): Promise<string> {
    const cacheKey = this.getCacheKey(fileId)
    const existingDocKey: string = await this.cache.get(cacheKey)
    if (existingDocKey) {
      return existingDocKey
    }
    const docKey = generateShortUUID(64)
    await this.cache.set(cacheKey, docKey, this.expiration)
    this.logger.debug(`${this.getDocumentKey.name} - ${cacheKey} (${docKey}) created`)
    return docKey
  }

  private async saveDocument(space: SpaceEnv, url: string): Promise<void> {
    /* url format:
      https://onlyoffice-server.com/cache/files/data/-33120641_7158/output.pptx/output.pptx
      ?md5=duFHKC-5d47s-RRcYn3hAw&expires=1739400549&shardkey=-33120641&filename=output.pptx
     */
    const urlParams = new URLSearchParams(url.split('?').at(-1))
    // it is not the md5 of the file but a md5 generated by the combination of the elements of the url
    const md5: string = urlParams.get('md5')
    const tmpFilePath = await uniqueFilePathFromDir(path.join(os.tmpdir(), `${md5}-${urlParams.get('filename')}`))

    // convert remote file to the local file with the current extension if these extensions aren't equal
    const localExtension = path.extname(space.realPath).slice(1)
    const remoteExtension = path.extname(urlParams.get('filename')).slice(1)

    let downloadUrl: string
    if (localExtension !== remoteExtension && !ONLY_OFFICE_CONVERT_EXTENSIONS.ALLOW_AUTO.has(localExtension)) {
      if (ONLY_OFFICE_CONVERT_EXTENSIONS.FROM.has(remoteExtension) && ONLY_OFFICE_CONVERT_EXTENSIONS.TO.has(localExtension)) {
        downloadUrl = await this.convertDocument(urlParams.get('shardkey'), url, remoteExtension, localExtension, space.url)
      } else {
        throw new Error(`document cannot be converted from ${remoteExtension} -> ${localExtension} : ${space.url}`)
      }
    } else {
      downloadUrl = url
    }

    // download file
    let res: AxiosResponse
    try {
      res = await this.http.axiosRef({
        method: HTTP_METHOD.GET,
        url: downloadUrl,
        responseType: 'stream',
        httpsAgent: new https.Agent({ rejectUnauthorized: this.rejectUnauthorized })
      })
      await writeFromStream(tmpFilePath, res.data)
    } catch (e) {
      throw new Error(`unable to get document : ${e.message}`)
    }

    // try to verify the downloaded size
    const contentLength = parseInt(res.headers['content-length'], 10)
    if (!isNaN(contentLength)) {
      if (contentLength === 0) {
        this.logger.debug(`${this.saveDocument.name} - content length is 0 : ${space.url}`)
        return
      }
      const tmpFileSize = await fileSize(tmpFilePath)
      if (tmpFileSize !== contentLength) {
        throw new Error(`document size differs (${tmpFileSize} != ${contentLength})`)
      }
    }
    // copy contents to avoid inode changes (fileId in some cases)
    try {
      await copyFileContent(tmpFilePath, space.realPath)
      await removeFiles(tmpFilePath)
    } catch (e) {
      throw new Error(`unable to save document : ${e.message}`)
    }
  }

  private async convertDocument(id: string, url: string, fileType: string, outputType: string, spaceUrl: string): Promise<string> {
    const key: string = `${id}-${crypto.randomBytes(20).toString('hex')}`.slice(0, 20).replace('-', '_')
    const payload: OnlyOfficeConvertForm = {
      key: key,
      url: url,
      filetype: fileType,
      outputtype: outputType,
      async: false
    }
    payload.token = await this.genPayloadToken(payload)
    let result: { fileUrl?: string; fileType?: string; endConvert?: boolean; error?: number }
    try {
      const res: AxiosResponse = await this.http.axiosRef({
        method: HTTP_METHOD.POST,
        url: this.convertUrl,
        data: payload,
        httpsAgent: new https.Agent({ rejectUnauthorized: this.rejectUnauthorized })
      })
      result = res.data
    } catch (e) {
      throw new Error(`convert failed with status : ${e.response.status}`)
    }
    if (result.error) {
      throw new Error(`convert failed with reason : ${ONLY_OFFICE_CONVERT_ERROR.get(result.error)}`)
    }
    if (result.endConvert) {
      this.logger.log(`${this.convertDocument.name} - ${fileType} -> ${outputType} : ${spaceUrl}`)
      return result.fileUrl
    }
  }

  private getCacheKey(fileId: string): string {
    return `${CACHE_ONLY_OFFICE}|${fileId}`
  }
}
