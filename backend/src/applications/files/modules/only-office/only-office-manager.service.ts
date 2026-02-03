import { HttpService } from '@nestjs/axios'
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { AxiosResponse } from 'axios'
import https from 'https'
import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { JwtIdentityPayload } from '../../../../authentication/interfaces/jwt-payload.interface'
import { convertHumanTimeToSeconds } from '../../../../common/functions'
import { configuration } from '../../../../configuration/config.environment'
import { Cache } from '../../../../infrastructure/cache/services/cache.service'
import { ContextManager } from '../../../../infrastructure/context/services/context-manager.service'
import { HTTP_METHOD } from '../../../applications.constants'
import { SPACE_OPERATION } from '../../../spaces/constants/spaces'
import { FastifySpaceRequest } from '../../../spaces/interfaces/space-request.interface'
import type { SpaceEnv } from '../../../spaces/models/space-env.model'
import { haveSpaceEnvPermissions } from '../../../spaces/utils/permissions'
import type { UserModel } from '../../../users/models/user.model'
import { getAvatarBase64 } from '../../../users/utils/avatar'
import { DEPTH, LOCK_SCOPE } from '../../../webdav/constants/webdav'
import { FILE_MODE } from '../../constants/operations'
import type { FileDBProps } from '../../interfaces/file-db-props.interface'
import { FileLockOptions } from '../../interfaces/file-lock.interface'
import { FileLockProps } from '../../interfaces/file-props.interface'
import { LockConflict } from '../../models/file-lock-error'
import { FilesLockManager } from '../../services/files-lock-manager.service'
import {
  copyFileContent,
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
  ONLY_OFFICE_APP_LOCK,
  ONLY_OFFICE_CACHE_KEY,
  ONLY_OFFICE_CONVERT_ERROR,
  ONLY_OFFICE_CONVERT_EXTENSIONS,
  ONLY_OFFICE_EXTENSIONS,
  ONLY_OFFICE_INTERNAL_URI,
  ONLY_OFFICE_TOKEN_QUERY_PARAM_NAME
} from './only-office.constants'
import { OnlyOfficeReqDto } from './only-office.dtos'
import { OnlyOfficeCallBack, OnlyOfficeConfig, OnlyOfficeConvertForm } from './only-office.interface'
import { API_ONLY_OFFICE_CALLBACK, API_ONLY_OFFICE_DOCUMENT } from './only-office.routes'

@Injectable()
export class OnlyOfficeManager {
  private logger = new Logger(OnlyOfficeManager.name)
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
    private readonly filesLockManager: FilesLockManager
  ) {}

  async getSettings(user: UserModel, space: SpaceEnv, req: FastifySpaceRequest): Promise<OnlyOfficeReqDto> {
    if (!(await isPathExists(space.realPath))) {
      throw new HttpException('Document not found', HttpStatus.BAD_REQUEST)
    }
    if (await isPathIsDir(space.realPath)) {
      throw new HttpException('Document must be a file', HttpStatus.BAD_REQUEST)
    }
    const fileExtension = path.extname(space.realPath).slice(1)
    if (!ONLY_OFFICE_EXTENSIONS.has(fileExtension)) {
      throw new HttpException('Document not supported', HttpStatus.BAD_REQUEST)
    }
    let hasLock: false | FileLockProps = false
    let mode: FILE_MODE = haveSpaceEnvPermissions(space, SPACE_OPERATION.MODIFY) ? FILE_MODE.EDIT : FILE_MODE.VIEW
    if (mode === FILE_MODE.EDIT) {
      // Check lock conflicts
      try {
        await this.filesLockManager.checkConflicts(space.dbFile, DEPTH.RESOURCE, {
          userId: user.id,
          app: ONLY_OFFICE_APP_LOCK,
          lockScope: LOCK_SCOPE.SHARED
        })
      } catch (e) {
        if (e instanceof LockConflict) {
          hasLock = this.filesLockManager.convertLockToFileLockProps(e.lock)
          mode = FILE_MODE.VIEW
        } else {
          this.logger.error(`${this.getSettings.name} - ${e}`)
          throw new HttpException('Unable to check file lock', HttpStatus.INTERNAL_SERVER_ERROR)
        }
      }
    }
    const isMobile: boolean = this.mobileRegex.test(req.headers['user-agent'])
    const authToken: string = await this.genAuthToken(user)
    const fileUrl = this.buildUrl(API_ONLY_OFFICE_DOCUMENT, space.url, authToken)
    const callBackUrl = this.buildUrl(API_ONLY_OFFICE_CALLBACK, space.url, authToken)
    const config: OnlyOfficeReqDto = await this.genConfiguration(user, space, mode, fileUrl, fileExtension, callBackUrl, isMobile, hasLock)
    config.config.token = await this.genPayloadToken(config.config)
    return config
  }

  async callBack(user: UserModel, space: SpaceEnv, token: string) {
    const callBackData: OnlyOfficeCallBack = await this.jwt.verifyAsync(token, { secret: configuration.applications.files.onlyoffice.secret })
    try {
      switch (callBackData.status) {
        case 1:
          // users connect / disconnect
          await this.checkFileLock(user, space, callBackData)
          this.logger.debug(`document is being edited : ${space.url}`)
          break
        case 2:
          // No active users on the document
          await this.checkFileLock(user, space, callBackData)
          if (callBackData.notmodified) {
            this.logger.debug(`document was edited but closed with no changes : ${space.url}`)
          } else {
            this.logger.debug(`document was edited and closed but not saved (let's do it) : ${space.url}`)
            await this.saveDocument(space, callBackData.url)
          }
          await this.removeFileLock(user.id, space)
          await this.removeDocumentKey(space)
          break
        case 3:
          this.logger.error(`document cannot be saved, an error has occurred (try to save it) : ${space.url}`)
          await this.saveDocument(space, callBackData.url)
          break
        case 4:
          // No active users on the document
          await this.removeFileLock(user.id, space)
          await this.removeDocumentKey(space)
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
    mode: FILE_MODE,
    fileUrl: string,
    fileExtension: string,
    callBackUrl: string,
    isMobile: boolean,
    hasLock: false | FileLockProps
  ): Promise<OnlyOfficeReqDto> {
    const canEdit = mode === FILE_MODE.EDIT
    const documentType = ONLY_OFFICE_EXTENSIONS.get(fileExtension)
    return {
      hasLock: hasLock,
      documentServerUrl: this.externalOnlyOfficeServer || `${this.contextManager.headerOriginUrl()}${ONLY_OFFICE_INTERNAL_URI}`,
      config: {
        type: isMobile ? 'mobile' : 'desktop',
        height: '100%',
        width: '100%',
        documentType: documentType,
        document: {
          title: path.basename(space.relativeUrl),
          fileType: fileExtension,
          key: await this.getDocumentKey(space),
          permissions: {
            download: true,
            edit: canEdit,
            changeHistory: false,
            comment: canEdit,
            fillForms: canEdit,
            print: true,
            review: canEdit
          },
          url: fileUrl
        },
        editorConfig: {
          mode: mode,
          lang: 'en',
          region: 'en',
          callbackUrl: callBackUrl,
          user: { id: user.id.toString(), name: `${user.fullName} (${user.email})`, image: await getAvatarBase64(user.login) },
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

  private buildUrl(basePath: string, spaceUrl: string, token: string): string {
    const url = new URL(`${basePath}/${spaceUrl}`, this.contextManager.headerOriginUrl())
    url.searchParams.set(ONLY_OFFICE_TOKEN_QUERY_PARAM_NAME, token)
    return url.toString()
  }

  private genPayloadToken(payload: OnlyOfficeConfig | OnlyOfficeConvertForm): Promise<string> {
    return this.jwt.signAsync(payload, { secret: configuration.applications.files.onlyoffice.secret, expiresIn: 60 })
  }

  private genAuthToken(user: UserModel): Promise<string> {
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
        // Disconnect
        // Remove the lock if no other users are active on the document
        if (!Array.isArray(callBackData.users)) {
          await this.removeFileLock(parseInt(action.userid), space)
        }
      } else if (action.type === 1) {
        // Connect
        // Create the lock if it's the first user to open the document
        if (Array.isArray(callBackData.users) && callBackData.users.length === 1) {
          await this.createFileLock(user, space)
        }
      }
    }
  }

  private async createFileLock(user: UserModel, space: SpaceEnv): Promise<void> {
    const [ok, _fileLock] = await this.filesLockManager.create(
      user,
      space.dbFile,
      ONLY_OFFICE_APP_LOCK,
      DEPTH.RESOURCE,
      {
        lockRoot: null,
        lockToken: null,
        lockScope: LOCK_SCOPE.SHARED
      } satisfies FileLockOptions,
      this.expiration
    )
    if (!ok) {
      throw new HttpException('The file is locked', HttpStatus.LOCKED)
    }
  }

  private async removeFileLock(userId: number, space: SpaceEnv): Promise<void> {
    for (const lock of await this.filesLockManager.getLocksByPath(space.dbFile)) {
      if (lock.owner.id === userId) {
        await this.filesLockManager.removeLock(lock.key)
      }
    }
  }

  private async removeDocumentKey(space: SpaceEnv): Promise<void> {
    if (!(await this.filesLockManager.isPathLocked(space.dbFile))) {
      const cacheKey = this.getCacheKey(space.dbFile)
      const r = await this.cache.del(cacheKey)
      this.logger.debug(`${this.removeDocumentKey.name} - ${cacheKey} ${r ? '' : 'not'} removed`)
    }
  }

  private async getDocumentKey(space: SpaceEnv): Promise<string> {
    // Uniq key to identify the document in OnlyOffice
    const cacheKey = this.getCacheKey(space.dbFile)
    const existingDocKey: string = await this.cache.get(cacheKey)
    if (existingDocKey) {
      return existingDocKey
    }
    const docKey = genEtag(null, space.realPath, false)
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
    // it is not the md5 of the file but the md5 generated by the combination of the elements of the url
    const md5: string = urlParams.get('md5')
    const tmpFilePath = await uniqueFilePathFromDir(path.join(os.tmpdir(), `${md5}-${urlParams.get('filename')}`))

    // convert the remote file to the local file with the current extension if these extensions aren't equal
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
    if (!isNaN(contentLength) && contentLength !== 0) {
      const tmpFileSize = await fileSize(tmpFilePath)
      if (tmpFileSize !== contentLength) {
        throw new Error(`document size differs (${tmpFileSize} != ${contentLength})`)
      }
    } else if (contentLength === 0) {
      this.logger.warn(`${this.saveDocument.name} - content length is 0 : ${space.url}`)
    }
    // copy contents to avoid inode changes (`file.id` in some cases)
    try {
      // todo: versioning
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

  private getCacheKey(dbFile: FileDBProps): string {
    return `${ONLY_OFFICE_CACHE_KEY}|${genUniqHashFromFileDBProps(dbFile)}`
  }
}
