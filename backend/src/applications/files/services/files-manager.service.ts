/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpService } from '@nestjs/axios'
import { HttpStatus, Injectable, Logger } from '@nestjs/common'
import archiver, { Archiver, ArchiverError } from 'archiver'
import { AxiosResponse } from 'axios'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { extract as extractTar } from 'tar'
import { FastifyAuthenticatedRequest } from '../../../authentication/interfaces/auth-request.interface'
import { generateThumbnail } from '../../../common/image'
import { HTTP_METHOD } from '../../applications.constants'
import { SPACE_OPERATION } from '../../spaces/constants/spaces'
import { FastifySpaceRequest } from '../../spaces/interfaces/space-request.interface'
import { SpaceEnv } from '../../spaces/models/space-env.model'
import { SpacesManager } from '../../spaces/services/spaces-manager.service'
import { realTrashPathFromSpace } from '../../spaces/utils/paths'
import { canAccessToSpace, haveSpaceEnvPermissions } from '../../spaces/utils/permissions'
import { UserModel } from '../../users/models/user.model'
import { DEPTH, LOCK_DEPTH } from '../../webdav/constants/webdav'
import { CACHE_LOCK_FILE_TTL } from '../constants/cache'
import { tarGzExtension } from '../constants/compress'
import { COMPRESSION_EXTENSION, DEFAULT_HIGH_WATER_MARK } from '../constants/files'
import { FILE_OPERATION } from '../constants/operations'
import { DOCUMENT_TYPE, SAMPLE_PATH_WITHOUT_EXT } from '../constants/samples'
import { CompressFileDto } from '../dto/file-operations.dto'
import { FileTaskEvent } from '../events/file-task-event'
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
  isPathIsDir,
  makeDir,
  moveFiles,
  removeFiles,
  touchFile,
  uniqueDatedFilePath,
  uniqueFilePathFromDir,
  writeFromStream,
  writeFromStreamAndChecksum
} from '../utils/files'
import { SendFile } from '../utils/send-file'
import { extractZip } from '../utils/unzip-file'
import { regExpPrivateIP } from '../utils/url-file'
import { FilesLockManager } from './files-lock-manager.service'
import { FilesQueries } from './files-queries.service'

@Injectable()
export class FilesManager {
  /* Spaces permissions are checked in the space guard, except for the copy/move destination */
  private logger = new Logger(FilesManager.name)

  constructor(
    private readonly http: HttpService,
    private readonly filesQueries: FilesQueries,
    private readonly filesLockManager: FilesLockManager,
    private readonly spacesManager: SpacesManager
  ) {}

  sendFileFromSpace(space: SpaceEnv, asAttachment = false, downloadName = ''): SendFile {
    return new SendFile(space.realPath, asAttachment, downloadName)
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
    // if tmpPath is used, we lock the final destination during the transfer
    // space.realPath is replaced by tmpPath (if allowed), if the move operation failed we remove the tmp file
    const fExists = await isPathExists(space.realPath)
    const fTmpExists = options?.tmpPath ? await isPathExists(options.tmpPath) : false
    if (fExists && req.method === HTTP_METHOD.POST) {
      throw new FileError(HttpStatus.METHOD_NOT_ALLOWED, 'Resource already exists')
    }
    if (fExists && (await isPathIsDir(space.realPath))) {
      throw new FileError(HttpStatus.METHOD_NOT_ALLOWED, 'The location is a directory')
    }
    if (options?.tmpPath) {
      // ensure tmpPath parent dir exists
      await makeDir(dirName(options.tmpPath), true)
    } else if (!(await isPathExists(dirName(space.realPath)))) {
      throw new FileError(HttpStatus.CONFLICT, 'Parent must exists')
    }
    /* File Lock */
    let fileLock: FileLock | undefined
    if (options?.dav) {
      // check locks
      await this.filesLockManager.checkConflicts(space.dbFile, options?.dav?.depth || DEPTH.RESOURCE, {
        userId: user.id,
        lockTokens: options.dav?.lockTokens
      })
    } else {
      // create lock if there is no webdav context
      const [ok, lock] = await this.filesLockManager.create(user, space.dbFile, DEPTH.RESOURCE)
      if (!ok) {
        throw new LockConflict(lock, 'Conflicting lock')
      }
      fileLock = lock
    }
    try {
      // check range
      let startRange = 0
      if ((fExists || fTmpExists) && req.headers['content-range']) {
        // with PUT method, some webdav clients use the `content-range` header,
        // which is normally reserved for a response to a request containing the `range` header.
        // However, for more compatibility let's accept it
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
          this.logger.error(`${this.saveStream.name} - unable to move ${options.tmpPath} -> ${space.realPath} : ${e}`)
          throw new FileError(HttpStatus.INTERNAL_SERVER_ERROR, 'Unable to move tmp file to dst file')
        }
      }
      if (options?.checksumAlg) {
        return checksum
      }
      return fExists
    } finally {
      if (fileLock) {
        try {
          await this.filesLockManager.removeLock(fileLock.key)
        } catch (e) {
          this.logger.warn(`Failed to remove lock ${fileLock.key}: ${e}`)
        }
      }
    }
  }

  async saveMultipart(user: UserModel, space: SpaceEnv, req: FastifySpaceRequest) {
    /* Accepted methods:
        POST: creates new resource
        PUT: creates or fully replaces a resource at the given URI (even if intermediate paths do not exist)
        PATCH: updates the content of a single existing resource without creating it
    */
    const overwrite = req.method === HTTP_METHOD.PUT
    const patch = req.method === HTTP_METHOD.PATCH
    const realParentPath = dirName(space.realPath)

    if (!overwrite) {
      if (!patch && (await isPathExists(space.realPath))) {
        throw new FileError(HttpStatus.BAD_REQUEST, 'Resource already exists')
      }
      if (!(await isPathExists(realParentPath))) {
        throw new FileError(HttpStatus.BAD_REQUEST, 'Parent must exists')
      }
      if (!(await isPathIsDir(realParentPath))) {
        throw new FileError(HttpStatus.BAD_REQUEST, 'Parent must be a directory')
      }
    }

    const basePath = realParentPath + path.sep

    for await (const part of req.files()) {
      // If the request uses the PATCH method, the file name corresponds to the space
      const partFileName = patch ? fileName(space.realPath) : part.filename
      // `part.filename` may contain a path like foo/bar.txt
      const dstFile = path.resolve(basePath, partFileName)
      // Prevent path traversal
      if (!dstFile.startsWith(basePath)) {
        throw new FileError(HttpStatus.FORBIDDEN, 'Location is not allowed')
      }

      const dstDir = dirName(dstFile)

      if (overwrite) {
        // Prevent errors when an uploaded file would replace a directory with the same name
        // Only applies in `overwrite` cases
        if ((await isPathExists(dstFile)) && (await isPathIsDir(dstFile))) {
          // If a directory already exists at the destination path, delete it to allow overwriting with the uploaded file
          const dstUrl = path.join(path.dirname(space.url), partFileName)
          const dstSpace = await this.spacesManager.spaceEnv(user, dstUrl.split('/'))
          await this.delete(user, dstSpace)
        } else if ((await isPathExists(dstDir)) && !(await isPathIsDir(dstDir))) {
          // If the destination's parent exists but is a file, remove it so we can create the directory
          const dstUrl = path.join(path.dirname(space.url), path.dirname(partFileName))
          const dstSpace = await this.spacesManager.spaceEnv(user, dstUrl.split('/'))
          await this.delete(user, dstSpace)
        }
      }
      // Create the directory in the space
      if (!(await isPathExists(dstDir))) {
        await makeDir(dstDir, true)
      }
      // Create or refresh lock
      const dbFile = { ...space.dbFile, path: path.join(dirName(space.dbFile.path), partFileName) }
      const [created, fileLock] = await this.filesLockManager.createOrRefresh(user, dbFile, DEPTH.RESOURCE, CACHE_LOCK_FILE_TTL)
      // Do
      try {
        await writeFromStream(dstFile, part.file)
      } finally {
        if (created) {
          await this.filesLockManager.removeLock(fileLock.key)
        }
      }
      if (patch) {
        // Only one resource can be updated with the PATCH method.
        break
      }
    }
  }

  async touch(user: UserModel, space: SpaceEnv, mtime: number, checkLocks = true): Promise<void> {
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
    checkFileName(space.realPath)
    if (!overwrite && (await isPathExists(space.realPath))) {
      throw new FileError(HttpStatus.BAD_REQUEST, 'Resource already exists')
    }
    if (checkLocks) {
      await this.filesLockManager.checkConflicts(space.dbFile, DEPTH.RESOURCE, { userId: user.id })
    }
    // use sample documents when possible
    const fileExtension = path.extname(space.realPath)
    if (checkDocument && fileExtension !== '.txt' && Object.values(DOCUMENT_TYPE).indexOf(fileExtension) > -1) {
      const srcSample = path.join(__dirname, `${SAMPLE_PATH_WITHOUT_EXT}${fileExtension}`)
      return copyFileContent(srcSample, space.realPath)
    } else {
      return createEmptyFile(space.realPath)
    }
  }

  async mkDir(user: UserModel, space: SpaceEnv, recursive = false, dav?: { depth: LOCK_DEPTH; lockTokens: string[] }): Promise<void> {
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
    if (!canAccessToSpace(user, dstSpace)) {
      this.logger.warn(`${this.copyMove.name} - is not allowed to access to this space repository : ${dstSpace.repository}`)
      throw new FileError(HttpStatus.FORBIDDEN, 'You are not allowed to access to this repository')
    }
    if (!haveSpaceEnvPermissions(dstSpace, SPACE_OPERATION.ADD)) {
      this.logger.warn(`${this.copyMove.name} - is not allowed to copy/move on this space : *${dstSpace.alias}* (${dstSpace.id}) : ${dstSpace.url}`)
      throw new FileError(HttpStatus.FORBIDDEN, 'You are not allowed to copy/move on the destination')
    }
    if (dstSpace.quotaIsExceeded) {
      this.logger.warn(`${this.copyMove.name} - quota is exceeded for *${dstSpace.alias}* (${dstSpace.id})`)
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
          this.logger.error(`${this.copyMove.name} - Cannot create parent directory for destination ${dstSpace.realPath} : ${e}`)
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
      /* Handle renaming a space file with the same name as a space root :
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
          this.logger.warn(`${this.copyMove.name} - storage quota will be exceeded for *${dstSpace.alias}* (${dstSpace.id})`)
          throw new FileError(HttpStatus.INSUFFICIENT_STORAGE, 'Storage quota will be exceeded')
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
      return this.filesQueries.moveFiles(srcSpace.dbFile, dstSpace.dbFile, isDir)
    }
    return copyFiles(srcSpace.realPath, dstSpace.realPath, overwrite, recursive)
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
      } else {
        // unsupported case: delete the file (this shouldn't happen)
        this.logger.error(`Unable to find trash path for space - *${space.alias}* (${space.id}) : delete permanently : ${space.realPath}`)
        forceDeleteInDB = true
        await removeFiles(space.realPath)
      }
    }
    // remove locks, these locks have already been checked in the `checkConflicts` function
    if (isDir) {
      this.filesLockManager.removeChildLocks(user, space.dbFile).catch((e: Error) => this.logger.error(`${this.delete.name} - ${e}`))
    }
    for (const lock of await this.filesLockManager.getLocksByPath(space.dbFile)) {
      this.filesLockManager.removeLock(lock.key).catch((e: Error) => this.logger.error(`${this.delete.name} - ${e}`))
    }
    // delete or move to trash the files in db
    return this.filesQueries.deleteFiles(space.dbFile, isDir, forceDeleteInDB)
  }

  async downloadFromUrl(user: UserModel, space: SpaceEnv, url: string): Promise<void> {
    this.logger.log(`${this.downloadFromUrl.name} : ${url}`)
    // create lock
    const rPath = await uniqueFilePathFromDir(space.realPath)
    const dbFile = space.dbFile
    dbFile.path = path.join(dirName(dbFile.path), fileName(space.realPath))
    const [ok, fileLock] = await this.filesLockManager.create(user, dbFile, DEPTH.RESOURCE)
    if (!ok) {
      throw new LockConflict(fileLock, 'Conflicting lock')
    }
    // tasking
    if (space.task.cacheKey) {
      let headRes: AxiosResponse

      try {
        headRes = await this.http.axiosRef({ method: HTTP_METHOD.HEAD, url: url, maxRedirects: 1 })
      } catch (e) {
        // release lock
        await this.filesLockManager.removeLock(fileLock.key)
        this.logger.error(`${this.downloadFromUrl.name} - ${url} : ${e}`)
        throw new FileError(HttpStatus.BAD_REQUEST, 'Unable to download file')
      }

      if (regExpPrivateIP.test(headRes.request.socket.remoteAddress)) {
        // release lock
        await this.filesLockManager.removeLock(fileLock.key)
        // prevent SSRF attack
        throw new FileError(HttpStatus.FORBIDDEN, 'Access to internal IP addresses is forbidden')
      }

      // attempt to retrieve the Content-Length header
      try {
        if ('content-length' in headRes.headers) {
          space.task.props.totalSize = parseInt(headRes.headers['content-length'], 10) || null
        }
      } catch (e) {
        this.logger.debug(`${this.downloadFromUrl.name} - content-length : ${e}`)
      }
      FileTaskEvent.emit('startWatch', space, FILE_OPERATION.DOWNLOAD, rPath)
    }
    // do
    try {
      const getRes = await this.http.axiosRef({ method: HTTP_METHOD.GET, url: url, responseType: 'stream', maxRedirects: 1 })
      if (regExpPrivateIP.test(getRes.request.socket.remoteAddress)) {
        // Prevent SSRF attacks and perform a DNS-rebinding check if a HEAD request has already been made
        throw new FileError(HttpStatus.FORBIDDEN, 'Access to internal IP addresses is forbidden')
      }
      await writeFromStream(rPath, getRes.data)
    } finally {
      // release lock
      await this.filesLockManager.removeLock(fileLock.key)
    }
  }

  async compress(user: UserModel, space: SpaceEnv, dto: CompressFileDto): Promise<void> {
    // This method is currently used only by files-methods.service, which handles input sanitization.
    // If it is used in other services in the future, make sure to refactor accordingly to sanitize inputs properly.
    const srcPath = dirName(space.realPath)
    // todo: a guest link tasksPath should be in specific directory (guest link has no home)
    const archiveExt = dto.name.endsWith(dto.extension) ? '' : `.${dto.extension}`
    const dstPath = await uniqueFilePathFromDir(path.join(dto.compressInDirectory ? srcPath : user.tasksPath, `${dto.name}${archiveExt}`))
    const archive: Archiver = archiver('tar', {
      gzip: dto.extension === tarGzExtension,
      gzipOptions: {
        level: 9
      }
    })
    // create lock
    let fileLock: FileLock
    if (dto.compressInDirectory) {
      const dbFile = space.dbFile
      dbFile.path = path.join(dirName(dbFile.path), fileName(dstPath))
      const [ok, lock] = await this.filesLockManager.create(user, dbFile, DEPTH.RESOURCE)
      if (!ok) {
        throw new LockConflict(lock, 'Conflicting lock')
      }
      fileLock = lock
    }
    if (space.task?.cacheKey) {
      space.task.props.compressInDirectory = dto.compressInDirectory
      FileTaskEvent.emit('startWatch', space, FILE_OPERATION.COMPRESS, dstPath)
    }
    // do
    try {
      archive.on('error', (error: ArchiverError) => {
        throw error
      })
      const dstStream = fs.createWriteStream(dstPath, { highWaterMark: DEFAULT_HIGH_WATER_MARK })
      archive.pipe(dstStream)
      for (const f of dto.files) {
        if (await isPathIsDir(f.path)) {
          archive.directory(f.path, dto.files.length > 1 ? fileName(f.path) : false)
        } else {
          archive.file(f.path, {
            name: f.rootAlias ? f.name : fileName(f.path)
          })
        }
      }
      await archive.finalize()
    } finally {
      if (fileLock) {
        await this.filesLockManager.removeLock(fileLock.key)
      }
    }
  }

  async decompress(user: UserModel, space: SpaceEnv): Promise<void> {
    // checks
    if (!(await isPathExists(space.realPath))) {
      throw new FileError(HttpStatus.NOT_FOUND, 'Location not found')
    }
    const extension = path.extname(space.realPath)
    if (!COMPRESSION_EXTENSION.has(extension)) {
      throw new FileError(HttpStatus.BAD_REQUEST, `${extension} is not supported`)
    }
    // make destination folder
    const dstPath = await uniqueFilePathFromDir(path.join(dirName(space.realPath), path.basename(space.realPath, extension)))
    await makeDir(dstPath)
    // create lock
    const dbFile = space.dbFile
    dbFile.path = path.join(dirName(dbFile.path), fileName(dstPath))
    const [ok, fileLock] = await this.filesLockManager.create(user, dbFile, DEPTH.INFINITY)
    if (!ok) {
      throw new LockConflict(fileLock, 'Conflicting lock')
    }
    // tasking
    if (space.task?.cacheKey) FileTaskEvent.emit('startWatch', space, FILE_OPERATION.DECOMPRESS, dstPath)
    // do
    try {
      if (extension === '.zip') {
        await extractZip(space.realPath, dstPath)
      } else {
        await extractTar({
          file: space.realPath,
          cwd: dstPath,
          gzip: COMPRESSION_EXTENSION.get(extension) === tarGzExtension,
          preserveOwner: false
        })
      }
    } finally {
      await this.filesLockManager.removeLock(fileLock.key)
    }
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
      this.logger.warn(e)
      throw new FileError(HttpStatus.BAD_REQUEST, 'File is not an image')
    }
  }

  async lock(user: UserModel, space: SpaceEnv): Promise<FileLockProps> {
    const rExists = await isPathExists(space.realPath)
    if (!rExists) {
      this.logger.warn('Lock refresh must specify an existing resource')
      throw new FileError(HttpStatus.BAD_REQUEST, 'Lock refresh must specify an existing resource')
    }
    const [_created, lock] = await this.filesLockManager.createOrRefresh(user, space.dbFile, DEPTH.RESOURCE, CACHE_LOCK_FILE_TTL)
    return this.filesLockManager.convertLockToFileLockProps(lock)
  }

  async unlock(user: UserModel, space: SpaceEnv): Promise<void> {
    if (!(await isPathExists(space.realPath))) {
      this.logger.warn(`Unable to unlock: ${space.url} - resource does not exist`)
      throw new FileError(HttpStatus.BAD_REQUEST, 'Unlock must specify an existing resource')
    }
    const fileLocks = await this.filesLockManager.getLocksByPath(space.dbFile)
    if (fileLocks.length === 0) {
      this.logger.warn(`Unable to find lock: ${space.url} - resource does not exist`)
      return
    }
    for (const lock of fileLocks) {
      if (lock.owner.id === user.id) {
        // Refresh if more than half of the TTL has passed
        await this.filesLockManager.removeLock(lock.key)
      } else {
        throw new LockConflict(lock, 'Conflicting lock')
      }
    }
  }
}
