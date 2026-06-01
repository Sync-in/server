import { HttpService } from '@nestjs/axios'
import { HttpStatus, Injectable, Logger } from '@nestjs/common'
import archiver, { Archiver } from 'archiver'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { FastifyAuthenticatedRequest } from '../../../authentication/interfaces/auth-request.interface'
import { generateThumbnail } from '../../../common/image'
import { SERVER_NAME } from '../../../common/shared'
import { ContextManager } from '../../../infrastructure/context/services/context-manager.service'
import { HTTP_METHOD } from '../../applications.constants'
import { NOTIFICATION_APP, NOTIFICATION_APP_EVENT } from '../../notifications/constants/notifications'
import { NotificationContent } from '../../notifications/interfaces/notification-properties.interface'
import { NotificationsManager } from '../../notifications/services/notifications-manager.service'
import { SPACE_OPERATION, SPACE_PERSONAL, SPACE_REPOSITORY } from '../../spaces/constants/spaces'
import { FastifySpaceRequest } from '../../spaces/interfaces/space-request.interface'
import { SpaceEnv } from '../../spaces/models/space-env.model'
import { SpacesManager } from '../../spaces/services/spaces-manager.service'
import { realTrashPathFromSpace } from '../../spaces/utils/paths'
import { canAccessToSpace, haveSpaceEnvPermissions } from '../../spaces/utils/permissions'
import { UserModel } from '../../users/models/user.model'
import { DEPTH, LOCK_DEPTH } from '../../webdav/constants/webdav'
import { CACHE_LOCK_FILE_TTL } from '../constants/cache'
import { TAR_EXTENSION, TAR_GZ_EXTENSION } from '../constants/compress'
import { COMPRESSION_EXTENSION, DEFAULT_HIGH_WATER_MARK } from '../constants/files'
import { FILE_OPERATION } from '../constants/operations'
import { ALL_DOCUMENT_TYPES, DEFAULT_DOCUMENT_TYPES, SAMPLE_PATH_WITHOUT_EXT } from '../constants/samples'
import { CompressFileDto, DownloadFileDto } from '../dto/file-operations.dto'
import { FileDBProps } from '../interfaces/file-db-props.interface'
import { FileLock } from '../interfaces/file-lock.interface'
import { FileLockProps } from '../interfaces/file-props.interface'
import { FileError } from '../models/file-error'
import { LockConflict } from '../models/file-lock-error'
import {
  checkFileName,
  copyFileContent,
  copyFiles,
  createEmptyFile,
  dirName,
  dirSize,
  fileName,
  fileSize,
  getMimeType,
  isPathExists,
  isPathInside,
  isPathIsDir,
  makeDir,
  makeTempDir,
  moveFiles,
  removeFiles,
  tempFilePath,
  touchFile,
  uniqueDatedFilePath,
  uniqueFilePathFromDir,
  writeFromStream,
  writeFromStreamAndChecksum
} from '../utils/files'
import { SendFile } from '../utils/send-file'
import { extractZip } from '../utils/unzip-file'
import { extractTar } from '../utils/untar-file'
import { DownloadFile } from '../utils/download-file'
import { FilesLockManager } from './files-lock-manager.service'
import { FilesQueries } from './files-queries.service'
import { FileEvent, FileTaskEvent } from '../events/file-events'
import { ACTION } from '../../../common/constants'
import { pipeline } from 'node:stream/promises'
import { isMultipartFileTooLargeError, uploadTmpFilePath } from '../utils/upload-file'
import { FILE_ERROR_MESSAGES, maxFileSizeExceededError } from '../utils/errors'

@Injectable()
export class FilesManager {
  /* Spaces permissions are checked in the space guard, except for the copy/move destination */
  private logger = new Logger(FilesManager.name)

  constructor(
    private readonly http: HttpService,
    private readonly filesQueries: FilesQueries,
    private readonly spacesManager: SpacesManager,
    private readonly contextManager: ContextManager,
    private readonly notificationsManager: NotificationsManager,
    public readonly filesLockManager: FilesLockManager
  ) {}

  sendFileFromSpace(space: SpaceEnv, downloadName = ''): SendFile {
    return new SendFile(space.realPath, downloadName)
  }

  async saveStream(
    user: UserModel,
    space: SpaceEnv,
    req: FastifyAuthenticatedRequest,
    options: {
      checksumAlg: string
      tmpPath?: string
    }
  ): Promise<string>
  async saveStream(user: UserModel, space: SpaceEnv, req: FastifyAuthenticatedRequest, options?: any): Promise<boolean>
  async saveStream(
    user: UserModel,
    space: SpaceEnv,
    req: FastifyAuthenticatedRequest,
    options?: { dav?: { depth: LOCK_DEPTH; lockTokens: string[] }; checksumAlg?: string; tmpPath?: string }
  ): Promise<boolean | string> {
    // If tmpPath is used, we lock the final destination during the transfer
    // space.realPath is replaced by tmpPath (if allowed). If the move operation failed, we remove the tmp file
    this.checkNotTrashRepository(space)
    const fExists = await isPathExists(space.realPath)
    const fTmpExists = options?.tmpPath ? await isPathExists(options.tmpPath) : false
    if (fExists && req.method === HTTP_METHOD.POST) {
      throw new FileError(HttpStatus.METHOD_NOT_ALLOWED, 'Resource already exists')
    }
    if (fExists && (await isPathIsDir(space.realPath))) {
      throw new FileError(HttpStatus.METHOD_NOT_ALLOWED, 'The location is a directory')
    }
    if (options?.tmpPath) {
      // Ensure tmpPath parent dir exists
      await makeDir(dirName(options.tmpPath), true)
    } else if (!(await isPathExists(dirName(space.realPath)))) {
      throw new FileError(HttpStatus.CONFLICT, 'Parent must exists')
    }
    /* File Lock */
    let fileLock: FileLock | undefined
    if (options?.dav) {
      // Check locks
      await this.filesLockManager.checkConflicts(space.dbFile, options?.dav?.depth || DEPTH.RESOURCE, {
        userId: user.id,
        lockTokens: options.dav?.lockTokens
      })
    } else {
      // Create lock if there is no webdav context
      const [ok, lock] = await this.filesLockManager.create(user, space.dbFile, SERVER_NAME, DEPTH.RESOURCE)
      if (!ok) {
        throw new LockConflict(lock, 'Conflicting lock')
      }
      fileLock = lock
    }
    const fileEventAction = fExists ? ACTION.UPDATE : ACTION.ADD
    try {
      // Check range
      let startRange = 0
      if ((fExists || fTmpExists) && req.headers['content-range']) {
        // With PUT method, some webdav clients use the `content-range` header,
        // which is normally reserved for a response to a request containing the `range` header.
        // However, for more compatibility let's accept it.
        const match = /\d+/.exec(req.headers['content-range'])
        if (!match.length) {
          throw new FileError(HttpStatus.BAD_REQUEST, 'Content-range : header is malformed')
        }
        startRange = parseInt(match[0], 10)
        const size = await fileSize(options?.tmpPath || space.realPath)
        if (startRange !== size) {
          throw new FileError(HttpStatus.BAD_REQUEST, 'Content-range : start offset does not match the current file size')
        }
      }
      // todo: check file in db to update
      // todo : versioning here
      let checksum: string
      if (options?.checksumAlg) {
        checksum = await writeFromStreamAndChecksum(options?.tmpPath || space.realPath, req.raw, startRange, options.checksumAlg)
      } else {
        await writeFromStream(options?.tmpPath || space.realPath, req.raw, startRange)
      }
      if (options?.tmpPath) {
        try {
          // ensure parent path exists
          await makeDir(path.dirname(space.realPath), true)
          // move the uploaded file to destination
          await moveFiles(options.tmpPath, space.realPath, true)
        } catch (e) {
          // cleanup tmp file
          await removeFiles(options.tmpPath)
          this.logger.error({ tag: this.saveStream.name, msg: `unable to move ${options.tmpPath} -> ${space.realPath} : ${e}` })
          throw new FileError(HttpStatus.INTERNAL_SERVER_ERROR, 'Unable to move tmp file to dst file')
        }
      }
      if (options?.checksumAlg) {
        return checksum
      }
      return fExists
    } finally {
      // emit file event
      FileEvent.emit('event', { user, space, action: fileEventAction, rPath: space.realPath })
      if (fileLock) {
        try {
          await this.filesLockManager.removeLock(fileLock.key)
        } catch (e) {
          this.logger.warn({ tag: this.saveStream.name, msg: `Failed to remove lock ${fileLock.key}: ${e}` })
        }
      }
    }
  }

  async saveMultipart(user: UserModel, space: SpaceEnv, req: FastifySpaceRequest) {
    /* Accepted methods:
        POST: Creates new resource
        PUT: Creates or fully replaces a resource at the given URI (even if intermediate paths do not exist)
        PATCH: Updates the content of an existing resource without creating a new one.
               In this text-editing scenario, locking and refreshing occur automatically, but unlocking must be handled explicitly via
               the `unlock` method.
    */
    this.checkNotTrashRepository(space)
    const overwrite = req.method === HTTP_METHOD.PUT
    const patchMethod = req.method === HTTP_METHOD.PATCH
    const postMethod = req.method === HTTP_METHOD.POST
    const realParentPath = dirName(space.realPath)

    // For POST, space.realPath can be either the final file path or the root directory for a folder upload.
    if (postMethod && (await isPathExists(space.realPath))) {
      throw new FileError(HttpStatus.METHOD_NOT_ALLOWED, 'Resource already exists')
    }
    if (!overwrite) {
      if (!(await isPathExists(realParentPath))) {
        throw new FileError(HttpStatus.BAD_REQUEST, 'Parent must exists')
      }
      if (!(await isPathIsDir(realParentPath))) {
        throw new FileError(HttpStatus.BAD_REQUEST, 'Parent must be a directory')
      }
    }

    try {
      for await (const part of req.files({ throwFileSizeLimit: false })) {
        // If the request uses the PATCH method, the file name corresponds to the space
        const partFileName = patchMethod ? fileName(space.realPath) : part.filename
        // `part.filename` may contain a path like foo/bar.txt
        const dstFile = path.resolve(realParentPath, partFileName)
        if (!isPathInside(realParentPath, dstFile)) {
          throw new FileError(HttpStatus.FORBIDDEN, 'Location is not allowed')
        }
        const dstExists = await isPathExists(dstFile)
        const dstIsDir = dstExists ? await isPathIsDir(dstFile) : false
        if (postMethod && dstExists) {
          throw new FileError(HttpStatus.METHOD_NOT_ALLOWED, 'Resource already exists')
        }
        if (patchMethod && !dstExists) {
          throw new FileError(HttpStatus.NOT_FOUND, 'Location not found')
        }
        // PUT/PATCH write outside the destination first, so a failed upload does not corrupt an existing file.
        const tmpFile = overwrite || patchMethod ? uploadTmpFilePath(user.tmpPath, partFileName) : undefined
        const writePath = tmpFile || dstFile

        const dstDir = dirName(dstFile)
        // For overwrite conflicts, defer destructive deletes until the upload stream is fully validated.
        let dstSpaceToDeleteBeforeMove: SpaceEnv | undefined
        let dstParentSpaceToDeleteBeforeMove: SpaceEnv | undefined

        if (overwrite) {
          // Prevent errors when an uploaded file would replace a directory with the same name
          // Only applies in `overwrite` cases
          if (dstExists && dstIsDir) {
            // If a directory already exists at the destination path, delete it to allow overwriting with the uploaded file
            const dstUrl = path.join(path.dirname(space.url), partFileName)
            dstSpaceToDeleteBeforeMove = await this.spacesManager.spaceEnv(user, dstUrl.split('/'))
          } else if ((await isPathExists(dstDir)) && !(await isPathIsDir(dstDir))) {
            // If the destination's parent exists but is a file, remove it so we can create the directory
            const dstUrl = path.join(path.dirname(space.url), path.dirname(partFileName))
            dstParentSpaceToDeleteBeforeMove = await this.spacesManager.spaceEnv(user, dstUrl.split('/'))
          }
        }
        // Create the destination directory only when writing directly; user.tmpPath already exists.
        if (!tmpFile && !(await isPathExists(dstDir))) {
          await makeDir(dstDir, true)
        }

        // Create or refresh lock
        const dbFile = { ...space.dbFile, path: path.join(dirName(space.dbFile.path), partFileName) }
        // Use a short TTL for the PATCH method (which is also used for refreshing)
        const ttl = patchMethod ? CACHE_LOCK_FILE_TTL : undefined
        const [created, fileLock] = await this.filesLockManager.createOrRefresh(user, dbFile, SERVER_NAME, DEPTH.RESOURCE, ttl)

        let fileWritten = false
        // Do
        try {
          await writeFromStream(writePath, part.file)
          // With throwFileSizeLimit disabled, multipart marks the file stream as truncated instead of rejecting.
          if (part.file.truncated) {
            throw maxFileSizeExceededError()
          }
          if (tmpFile) {
            // If the following move fails after these deletes, the previous resources remain recoverable from the trash.
            if (dstSpaceToDeleteBeforeMove) {
              await this.delete(user, dstSpaceToDeleteBeforeMove)
            }
            if (dstParentSpaceToDeleteBeforeMove) {
              await this.delete(user, dstParentSpaceToDeleteBeforeMove)
            }
            if (!(await isPathExists(dstDir))) {
              await makeDir(dstDir, true)
            }
            await moveFiles(tmpFile, dstFile, true)
          }
          fileWritten = true
        } catch (e) {
          // Failed temporary uploads are discarded without touching the existing destination.
          if (tmpFile) {
            await removeFiles(tmpFile)
          } else if (!dstExists) {
            await removeFiles(dstFile)
          }
          if (isMultipartFileTooLargeError(e)) {
            throw maxFileSizeExceededError()
          }
          throw e
        } finally {
          if (fileWritten) {
            // Emit only after the final destination has been written or moved into place.
            const fileEventAction: ACTION = patchMethod || (dstExists && !dstIsDir) ? ACTION.UPDATE : ACTION.ADD
            FileEvent.emit('event', { user, space, action: fileEventAction, rPath: dstFile })
          }
          if (!patchMethod && created) {
            // Remove the file lock only if it has not been refreshed
            await this.filesLockManager.removeLock(fileLock.key)
          }
        }
        if (patchMethod) {
          // Only one resource can be updated with the PATCH method.
          break
        }
      }
    } catch (e) {
      if (isMultipartFileTooLargeError(e)) {
        throw maxFileSizeExceededError()
      }
      throw e
    }
  }

  async touch(user: UserModel, space: SpaceEnv, mtime: number, checkLocks = true): Promise<void> {
    this.checkNotTrashRepository(space)
    if (!(await isPathExists(space.realPath))) {
      throw new FileError(HttpStatus.NOT_FOUND, 'Location not found')
    }
    if (checkLocks) {
      await this.filesLockManager.checkConflicts(space.dbFile, DEPTH.RESOURCE, { userId: user.id })
    }
    // todo: update mtime in last files ( & in db file ?)
    await touchFile(space.realPath, mtime)
  }

  async mkFile(user: UserModel, space: SpaceEnv, overwrite = false, checkLocks = true, checkDocument = false): Promise<void> {
    this.checkNotTrashRepository(space)
    checkFileName(space.realPath)
    if (!overwrite && (await isPathExists(space.realPath))) {
      throw new FileError(HttpStatus.BAD_REQUEST, 'Resource already exists')
    }
    if (checkLocks) {
      await this.filesLockManager.checkConflicts(space.dbFile, DEPTH.RESOURCE, { userId: user.id })
    }
    // use sample documents when possible
    const fileExtension = path.extname(space.realPath).slice(1)
    if (
      checkDocument &&
      Object.values(DEFAULT_DOCUMENT_TYPES).indexOf(fileExtension) === -1 &&
      Object.values(ALL_DOCUMENT_TYPES).indexOf(fileExtension) > -1
    ) {
      const srcSample = path.join(__dirname, `${SAMPLE_PATH_WITHOUT_EXT}.${fileExtension}`)
      await copyFileContent(srcSample, space.realPath)
      // emit file event
      FileEvent.emit('event', { user, space, action: ACTION.ADD, rPath: space.realPath })
    } else {
      await createEmptyFile(space.realPath)
    }
  }

  async mkDir(user: UserModel, space: SpaceEnv, recursive = false, dav?: { depth: LOCK_DEPTH; lockTokens: string[] }): Promise<void> {
    this.checkNotTrashRepository(space)
    checkFileName(space.realPath)
    if (!recursive) {
      if (await isPathExists(space.realPath)) {
        throw new FileError(HttpStatus.METHOD_NOT_ALLOWED, 'Resource already exists')
      } else if (!(await isPathExists(dirName(space.realPath)))) {
        throw new FileError(HttpStatus.CONFLICT, 'Parent must exists')
      }
    }
    await this.filesLockManager.checkConflicts(space.dbFile, dav?.depth || DEPTH.RESOURCE, { userId: user.id, lockTokens: dav?.lockTokens })
    await makeDir(space.realPath, recursive)
  }

  async copyMove(
    user: UserModel,
    srcSpace: SpaceEnv,
    dstSpace: SpaceEnv,
    isMove: boolean,
    overwrite = false,
    mkdirDstParentPath = false,
    dav?: { depth: LOCK_DEPTH; lockTokens: string[] }
  ): Promise<void> {
    // checks
    this.checkNotTrashRepository(dstSpace)
    if (!canAccessToSpace(user, dstSpace)) {
      this.logger.warn({ tag: this.copyMove.name, msg: `is not allowed to access to this space repository : ${dstSpace.repository}` })
      throw new FileError(HttpStatus.FORBIDDEN, 'You are not allowed to access to this repository')
    }
    if (!haveSpaceEnvPermissions(dstSpace, SPACE_OPERATION.ADD)) {
      this.logger.warn({
        tag: this.copyMove.name,
        msg: `is not allowed to copy/move on this space : *${dstSpace.alias}* (${dstSpace.id}) : ${dstSpace.url}`
      })
      throw new FileError(HttpStatus.FORBIDDEN, 'You are not allowed to copy/move on the destination')
    }
    if (dstSpace.quotaIsExceeded) {
      this.logger.warn({ tag: this.copyMove.name, msg: `quota is exceeded for *${dstSpace.alias}* (${dstSpace.id})` })
      throw new FileError(HttpStatus.INSUFFICIENT_STORAGE, 'Quota is exceeded')
    }
    if (!(await isPathExists(srcSpace.realPath))) {
      throw new FileError(HttpStatus.NOT_FOUND, 'Location not found')
    }
    if (!(await isPathExists(dirName(dstSpace.realPath)))) {
      if (mkdirDstParentPath) {
        try {
          await makeDir(dirName(dstSpace.realPath), true)
        } catch (e) {
          this.logger.error({ tag: this.copyMove.name, msg: `Cannot create parent directory for destination ${dstSpace.realPath} : ${e}` })
          throw new FileError(HttpStatus.INTERNAL_SERVER_ERROR, 'Cannot create parent directory for destination')
        }
      } else {
        throw new FileError(HttpStatus.CONFLICT, 'Parent must exists')
      }
    }
    if (srcSpace.realPath === dstSpace.realPath) {
      throw new FileError(HttpStatus.FORBIDDEN, 'Cannot copy/move source onto itself')
    }
    if (`${dstSpace.realPath}/`.startsWith(`${srcSpace.realPath}/`)) {
      throw new FileError(HttpStatus.FORBIDDEN, 'Cannot copy/move source below itself')
    }
    if (dirName(srcSpace.url) === dirName(dstSpace.url) && dirName(srcSpace.realPath) !== dirName(dstSpace.realPath)) {
      /* Handle renaming a space file with the same name as a space root:
        srcSpace.url = '/space/sync-in/code2.ts' (a space file)
        srcSpace.realPath = '/home/sync-in/spaces/sync-in/code2.ts
        dstSpace.url = '/space/sync-in/code.ts' (a space root)
        dstSpace.realPath = '/home/sync-in/users/jo/files/code2.ts !!
       */
      throw new FileError(HttpStatus.BAD_REQUEST, 'An anchored file already has this name')
    }
    if (!overwrite && (await isPathExists(dstSpace.realPath))) {
      /* Handle case-sensitive (in renaming context):
        srcSpace.url = '/space/sync-in/code.ts'
        dstSpace.url = '/space/sync-in/code.TS'
       The destination exists because it's the same file, bypass this
     */
      if (!(isMove && srcSpace.realPath.toLowerCase() === dstSpace.realPath.toLowerCase())) {
        throw new FileError(dav ? HttpStatus.PRECONDITION_FAILED : HttpStatus.BAD_REQUEST, 'The destination already exists')
      }
    }

    const isDir = await isPathIsDir(srcSpace.realPath)

    if (dstSpace.storageQuota) {
      /* Skip validation when moving to the same space; for copy operations, run all checks. */
      if (!isMove || (isMove && srcSpace.id !== dstSpace.id)) {
        const size = isDir ? (await dirSize(srcSpace.realPath))[0] : await fileSize(srcSpace.realPath)
        if (dstSpace.willExceedQuota(size)) {
          this.logger.warn({ tag: this.copyMove.name, msg: `${FILE_ERROR_MESSAGES.STORAGE_QUOTA_EXCEEDED} for *${dstSpace.alias}* (${dstSpace.id})` })
          throw new FileError(HttpStatus.INSUFFICIENT_STORAGE, FILE_ERROR_MESSAGES.STORAGE_QUOTA_EXCEEDED)
        }
      }
    }

    // check lock conflicts on source and destination
    let recursive: boolean
    let depth: LOCK_DEPTH
    if (dav?.depth) {
      recursive = dav.depth === DEPTH.INFINITY
      depth = dav.depth
    } else {
      recursive = isDir
      depth = recursive ? DEPTH.INFINITY : DEPTH.RESOURCE
    }
    if (isMove) {
      // check source
      await this.filesLockManager.checkConflicts(srcSpace.dbFile, depth, { userId: user.id, lockTokens: dav?.lockTokens })
    }
    // check destination
    await this.filesLockManager.checkConflicts(dstSpace.dbFile, depth, { userId: user.id, lockTokens: dav?.lockTokens })

    // overwrite
    if (overwrite && (await isPathExists(dstSpace.realPath))) {
      // todo : versioning here
      await this.delete(user, dstSpace)
    }

    // send it to task watcher
    if (srcSpace.task?.cacheKey) {
      if (!isDir) srcSpace.task.props.totalSize = await fileSize(srcSpace.realPath)
      FileTaskEvent.emit('startWatch', srcSpace, isMove ? FILE_OPERATION.MOVE : FILE_OPERATION.COPY, dstSpace.realPath)
    }

    // do
    if (isMove) {
      await moveFiles(srcSpace.realPath, dstSpace.realPath, overwrite)
      // emit a file event when the source space is different from the destination space
      if (srcSpace.realBasePath !== dstSpace.realBasePath) {
        FileEvent.emit('event', { user, space: srcSpace, action: ACTION.DELETE_PERMANENTLY, rPath: srcSpace.realPath })
        FileEvent.emit('event', { user, space: dstSpace, action: ACTION.ADD, rPath: dstSpace.realPath })
      }
      await this.filesQueries.moveFiles(srcSpace.dbFile, dstSpace.dbFile, isDir)
    } else {
      await copyFiles(srcSpace.realPath, dstSpace.realPath, overwrite, recursive)
      // emit file event
      FileEvent.emit('event', { user, space: dstSpace, action: ACTION.ADD, rPath: dstSpace.realPath })
    }
  }

  async delete(user: UserModel, space: SpaceEnv, dav?: { lockTokens: string[] }): Promise<void> {
    if (!(await isPathExists(space.realPath))) {
      throw new FileError(HttpStatus.NOT_FOUND, 'Location not found')
    }
    // check lock conflicts
    const isDir = await isPathIsDir(space.realPath)
    await this.filesLockManager.checkConflicts(space.dbFile, isDir ? DEPTH.INFINITY : DEPTH.RESOURCE, {
      userId: user.id,
      lockTokens: dav?.lockTokens
    })
    // file system deletion
    let forceDeleteInDB = false
    if (space.inTrashRepository) {
      await removeFiles(space.realPath)
      FileEvent.emit('event', { user, space, action: ACTION.DELETE_PERMANENTLY, rPath: space.realPath })
    } else {
      const baseTrashPath = realTrashPathFromSpace(user, space)
      if (baseTrashPath) {
        const name = fileName(space.realPath)
        const trashDir = path.join(baseTrashPath, dirName(space.dbFile.path))
        const trashFile = path.join(trashDir, name)
        if (!(await isPathExists(trashDir))) {
          await makeDir(trashDir, true)
        }
        if (await isPathExists(trashFile)) {
          // if a resource already exists in the trash, rename it with the date
          const dstTrash = await uniqueDatedFilePath(trashFile)
          // move the resource on fs
          await moveFiles(trashFile, dstTrash.path)
          // move the resource in db
          const trashFileDB: FileDBProps = { ...space.dbFile, inTrash: true }
          const dstTrashFileDB: FileDBProps = { ...trashFileDB, path: path.join(dirName(trashFileDB.path), fileName(dstTrash.path)) }
          await this.filesQueries.moveFiles(trashFileDB, dstTrashFileDB, dstTrash.isDir)
        }
        await moveFiles(space.realPath, trashFile, true)
        // emit file event
        if (space.dbFile.shareExternalId) {
          // deleted files from shares with external locations are moved to the owner’s trash
          FileEvent.emit('event', { user, space, action: ACTION.DELETE_PERMANENTLY, rPath: space.realPath })
          // emit an event for the file newly moved to the owner’s trash space
          const userSpace = new SpaceEnv(SPACE_PERSONAL, null, false)
          userSpace.setup(user, SPACE_REPOSITORY.TRASH, null, [], [])
          FileEvent.emit('event', { user, space: userSpace, action: ACTION.ADD, rPath: trashFile })
        }
      } else {
        // unsupported case: delete the file (this shouldn't happen)
        this.logger.error({
          tag: this.delete.name,
          msg: `Unable to find trash path for space - *${space.alias}* (${space.id}) : delete permanently : ${space.realPath}`
        })
        forceDeleteInDB = true
        await removeFiles(space.realPath)
        // emit file event
        FileEvent.emit('event', { user, space, action: ACTION.DELETE_PERMANENTLY, rPath: space.realPath })
      }
    }
    // remove locks, these locks have already been checked in the `checkConflicts` function
    if (isDir) {
      this.filesLockManager.removeChildLocks(user, space.dbFile).catch((e: Error) => this.logger.error({ tag: this.delete.name, msg: `${e}` }))
    }
    for (const lock of await this.filesLockManager.getLocksByPath(space.dbFile)) {
      this.filesLockManager.removeLock(lock.key).catch((e: Error) => this.logger.error({ tag: this.delete.name, msg: `${e}` }))
    }
    // delete or move to trash the files in db
    await this.filesQueries.deleteFiles(space.dbFile, isDir, forceDeleteInDB)
  }

  async downloadFromUrl(user: UserModel, space: SpaceEnv, downloadDto: DownloadFileDto): Promise<void> {
    this.checkNotTrashRepository(space)
    this.logger.log({ tag: this.downloadFromUrl.name, msg: `${downloadDto.url}` })
    const dstPath = await uniqueFilePathFromDir(space.realPath)
    const tmpPath = tempFilePath(user.tmpPath, `${fileName(dstPath)}-download-`)
    const dbFile = space.dbFile
    dbFile.path = path.join(dirName(dbFile.path), fileName(dstPath))

    // create lock
    const [ok, fileLock] = await this.filesLockManager.create(user, dbFile, SERVER_NAME, DEPTH.RESOURCE)
    if (!ok) {
      throw new LockConflict(fileLock, 'Conflicting lock')
    }

    try {
      await new DownloadFile(this.http).download(downloadDto, tmpPath, { space: space, publishedPath: dstPath })
      await moveFiles(tmpPath, dstPath)
    } catch (e) {
      await removeFiles(tmpPath).catch((err: Error) =>
        this.logger.error({ tag: this.downloadFromUrl.name, msg: `unable to remove ${tmpPath} : ${err}` })
      )
      throw e
    } finally {
      // release lock
      await this.filesLockManager.removeLock(fileLock.key)
    }
    FileEvent.emit('event', { user, space, action: ACTION.ADD, rPath: dstPath })
  }

  async compress(user: UserModel, space: SpaceEnv, dto: CompressFileDto): Promise<void> {
    // This method is currently used only by files-methods.service, which handles input sanitization.
    // If it is used in other services in the future, make sure to refactor accordingly to sanitize inputs properly.
    if (dto.compressInDirectory) {
      this.checkNotTrashRepository(space)
    }
    const srcPath = dirName(space.realPath)
    const archiveExt = dto.name.endsWith(dto.extension) ? '' : `.${dto.extension}`
    const dstPath = await uniqueFilePathFromDir(path.join(dto.compressInDirectory ? srcPath : user.tasksPath, `${dto.name}${archiveExt}`))
    const tmpPath = tempFilePath(user.tmpPath, `${fileName(dstPath)}-compress-`)
    // avoid using ZIP here because it can trigger high memory usage.
    const archive: Archiver = archiver(TAR_EXTENSION, {
      gzip: dto.extension === TAR_GZ_EXTENSION,
      gzipOptions: {
        level: 9
      }
    })
    // create lock
    let fileLock: FileLock | undefined
    if (dto.compressInDirectory) {
      const dbFile = space.dbFile
      dbFile.path = path.join(dirName(dbFile.path), fileName(dstPath))
      const [ok, lock] = await this.filesLockManager.create(user, dbFile, SERVER_NAME, DEPTH.RESOURCE)
      if (!ok) {
        throw new LockConflict(lock, 'Conflicting lock')
      }
      fileLock = lock
    }
    if (space.task?.cacheKey) {
      space.task.props.compressInDirectory = dto.compressInDirectory
      FileTaskEvent.emit('startWatch', space, FILE_OPERATION.COMPRESS, dstPath, tmpPath)
    }
    // do
    let aborted = false
    let pipePromise: Promise<void> | undefined
    let entriesPromise: Promise<void> | undefined
    try {
      const dstStream = fs.createWriteStream(tmpPath, { highWaterMark: DEFAULT_HIGH_WATER_MARK })
      pipePromise = pipeline(archive, dstStream) // handle archive errors + write stream
      entriesPromise = (async () => {
        for (const f of dto.files) {
          const isDir = await isPathIsDir(f.path)
          if (aborted) return
          if (isDir) {
            archive.directory(f.path, dto.files.length > 1 ? fileName(f.path) : false)
          } else {
            archive.file(f.path, { name: f.rootAlias ? f.name : fileName(f.path) })
          }
        }
        // The pipeline is the completion signal: finalize() may remain pending after abort().
        if (!aborted) {
          void archive.finalize().catch(() => undefined)
        }
      })()
      await Promise.all([entriesPromise, pipePromise])
      await moveFiles(tmpPath, dstPath)
    } catch (e) {
      aborted = true
      archive.abort()
      archive.destroy()
      await Promise.allSettled([entriesPromise, pipePromise].filter((promise): promise is Promise<void> => !!promise))
      await removeFiles(tmpPath).catch((err: Error) => this.logger.error({ tag: this.compress.name, msg: `unable to remove ${tmpPath} : ${err}` }))
      throw e
    } finally {
      if (fileLock) {
        await this.filesLockManager.removeLock(fileLock.key)
      }
    }
    // emit file event
    FileEvent.emit('event', { user, space, action: ACTION.ADD, rPath: dstPath })
  }

  async decompress(user: UserModel, space: SpaceEnv): Promise<void> {
    // checks
    this.checkNotTrashRepository(space)
    if (!(await isPathExists(space.realPath))) {
      throw new FileError(HttpStatus.NOT_FOUND, 'Location not found')
    }
    const extension = path.extname(space.realPath)
    if (!COMPRESSION_EXTENSION.has(extension)) {
      throw new FileError(HttpStatus.BAD_REQUEST, `${extension} is not supported`)
    }
    // make temporary extraction folder
    const dstPath = await uniqueFilePathFromDir(path.join(dirName(space.realPath), path.basename(space.realPath, extension)))
    const tmpPath = await makeTempDir(user.tmpPath, `${fileName(dstPath)}-extract-`)
    let fileLock: FileLock | undefined
    try {
      // create lock
      const dbFile = space.dbFile
      dbFile.path = path.join(dirName(dbFile.path), fileName(dstPath))
      const [ok, lock] = await this.filesLockManager.create(user, dbFile, SERVER_NAME, DEPTH.INFINITY)
      if (!ok) {
        throw new LockConflict(lock, 'Conflicting lock')
      }
      fileLock = lock
      // tasking
      if (space.task?.cacheKey) FileTaskEvent.emit('startWatch', space, FILE_OPERATION.DECOMPRESS, dstPath, tmpPath)
      // do
      if (extension === '.zip') {
        await extractZip(space.realPath, tmpPath)
      } else {
        await extractTar(space.realPath, tmpPath, COMPRESSION_EXTENSION.get(extension) === TAR_GZ_EXTENSION)
      }
      if (await isPathExists(dstPath)) {
        throw new FileError(HttpStatus.CONFLICT, 'The destination already exists')
      }
      await moveFiles(tmpPath, dstPath)
    } catch (e) {
      await removeFiles(tmpPath).catch((err: Error) => this.logger.error({ tag: this.decompress.name, msg: `unable to remove ${tmpPath} : ${err}` }))
      throw e
    } finally {
      if (fileLock) await this.filesLockManager.removeLock(fileLock.key)
    }
    // emit file event
    FileEvent.emit('event', { user, space, action: ACTION.ADD, rPath: dstPath })
  }

  async generateThumbnail(space: SpaceEnv, size: number): Promise<Readable> {
    if (!(await isPathExists(space.realPath))) {
      throw new FileError(HttpStatus.NOT_FOUND, 'Location not found')
    }
    if (getMimeType(space.realPath, false).indexOf('image') === -1) {
      throw new FileError(HttpStatus.BAD_REQUEST, 'File is not an image')
    }
    try {
      return generateThumbnail(space.realPath, size)
    } catch (e) {
      this.logger.warn({ tag: this.generateThumbnail.name, msg: e })
      throw new FileError(HttpStatus.BAD_REQUEST, 'File is not an image')
    }
  }

  async lock(user: UserModel, space: SpaceEnv): Promise<FileLockProps> {
    const rExists = await isPathExists(space.realPath)
    if (!rExists) {
      this.logger.warn({ tag: this.lock.name, msg: 'Lock refresh must specify an existing resource' })
      throw new FileError(HttpStatus.BAD_REQUEST, 'Lock refresh must specify an existing resource')
    }
    const [_created, lock] = await this.filesLockManager.createOrRefresh(user, space.dbFile, SERVER_NAME, DEPTH.RESOURCE, CACHE_LOCK_FILE_TTL)
    return this.filesLockManager.convertLockToFileLockProps(lock)
  }

  async unlock(user: UserModel, space: SpaceEnv, forceAsFileOwner = false): Promise<void> {
    if (!(await isPathExists(space.realPath))) {
      this.logger.warn({ tag: this.unlock.name, msg: `Unable to unlock: ${space.url} - resource does not exist` })
      throw new FileError(HttpStatus.BAD_REQUEST, 'Unlock must specify an existing resource')
    }
    const fileLocks = await this.filesLockManager.getLocksByPath(space.dbFile)
    if (fileLocks.length === 0) {
      this.logger.warn({ tag: this.unlock.name, msg: `Unable to find lock: ${space.url} - resource does not exist` })
      return
    }
    for (const lock of fileLocks) {
      if ((forceAsFileOwner && space.dbFile?.ownerId === user.id) || lock.owner.id === user.id) {
        // Refresh if more than half of the TTL has passed
        await this.filesLockManager.removeLock(lock.key)
      } else {
        throw new LockConflict(lock, 'Conflicting lock')
      }
    }
  }

  async unlockRequest(user: UserModel, space: SpaceEnv): Promise<void> {
    const fileLocks = await this.filesLockManager.getLocksByPath(space.dbFile)
    if (fileLocks.length === 0) {
      this.logger.warn({ tag: this.unlockRequest.name, msg: `Unable to find lock: ${space.url} - resource does not exist` })
      throw new FileError(HttpStatus.NOT_FOUND, 'Lock not found')
    }
    for (const lock of fileLocks) {
      if (lock.owner.id !== user.id) {
        const notification: NotificationContent = {
          app: NOTIFICATION_APP.UNLOCK_REQUEST,
          event: NOTIFICATION_APP_EVENT.UNLOCK_REQUEST,
          element: fileName(space.url),
          url: dirName(space.url)
        }
        this.notificationsManager
          .create([lock.owner.id], notification, {
            author: user,
            currentUrl: this.contextManager.headerOriginUrl()
          })
          .catch((e: Error) => this.logger.error({ tag: this.unlockRequest.name, msg: `${e}` }))
      }
    }
  }

  async getSize(space: SpaceEnv): Promise<number> {
    if (!(await isPathExists(space.realPath))) {
      throw new FileError(HttpStatus.NOT_FOUND, 'Location not found')
    }
    if (await isPathIsDir(space.realPath)) {
      return (await dirSize(space.realPath))[0]
    } else {
      return await fileSize(space.realPath)
    }
  }

  private checkNotTrashRepository(space: SpaceEnv): void {
    if (space.inTrashRepository) {
      throw new FileError(HttpStatus.FORBIDDEN, 'The trash is read-only')
    }
  }
}
