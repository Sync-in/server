import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { Readable } from 'node:stream'
import { ACTION } from '../../../../common/constants.js'
import { SERVER_NAME } from '../../../../common/shared.js'
import { CHECKSUM_PATTERN, isUuidV4 } from '../../../../common/validation.js'
import { configuration } from '../../../../configuration/config.environment.js'
import { HTTP_METHOD } from '../../../applications.constants.js'
import { SPACE_OPERATION } from '../../../spaces/constants/spaces.js'
import type { FastifySpaceRequest } from '../../../spaces/interfaces/space-request.interface.js'
import type { SpaceEnv } from '../../../spaces/models/space-env.model.js'
import { temporaryRootFromSpace } from '../../../spaces/utils/paths.js'
import { haveSpaceEnvPermissions } from '../../../spaces/utils/permissions.js'
import type { UserModel } from '../../../users/models/user.model.js'
import { DEPTH } from '../../../webdav/constants/webdav.js'
import { FILE_ERROR } from '../../core/constants/errors.js'
import { DEFAULT_CHECKSUM_ALGORITHM, DEFAULT_MIME_TYPE } from '../../core/constants/files.js'
import { FILE_OPERATION } from '../../core/constants/operations.js'
import {
  FILE_UPLOAD_SESSION,
  FILE_UPLOAD_SESSION_HEADER,
  FILE_UPLOAD_SESSION_MAX_ACTIVE_PER_ACTOR,
  FILE_UPLOAD_SESSION_MAX_AGE_MS,
  FILE_UPLOAD_SESSION_STATE,
  isFileUploadSessionDirectoryName
} from '../constants/upload-session.js'
import { FileEvent } from '../../core/events/file-events.js'
import type {
  FileUploadSessionChunkHeaders,
  FileUploadSessionContext,
  FileUploadSessionCreate,
  FileUploadSessionManifest,
  FileUploadSessionMetadata,
  FileUploadSessionMetadataHeaders,
  FileUploadSessionMethod,
  FileUploadSessionStatus
} from '../interfaces/file-upload-session.interface.js'
import { FileUploadSessionOffsetError } from '../models/file-upload-session-offset-error.js'
import { FileError } from '../../core/models/file-error.js'
import {
  checkFileName,
  checksumFile,
  dirName,
  isPathInside,
  makeDir,
  moveFiles,
  removeFiles,
  temporaryFilePath,
  touchFile,
  writeFromStream
} from '../../core/utils/files.js'
import { parseContentLength, parseUnsignedIntegerHeader } from '../../core/utils/upload-file.js'
import type { FileLock } from '../../locks/interfaces/file-lock.interface.js'
import { LockConflict } from '../../locks/models/file-lock-error.js'
import { FilesLockManager } from '../../locks/services/files-lock-manager.service.js'
import { FilesManager } from '../../core/services/files-manager.service.js'

@Injectable()
export class FilesUploadSessionManager {
  private readonly logger = new Logger(FilesUploadSessionManager.name)

  constructor(
    private readonly filesLockManager: FilesLockManager,
    private readonly filesManager: FilesManager
  ) {}

  async writeUploadSessionChunk(
    req: FastifySpaceRequest,
    uploadId: string,
    res: FastifyReply,
    method?: FileUploadSessionMethod,
    sync = false
  ): Promise<void> {
    try {
      const headers: FileUploadSessionChunkHeaders = {
        contentLength: req.headers['content-length'],
        contentType: req.headers['content-type'],
        uploadLength: req.headers['upload-length'],
        uploadOffset: req.headers['upload-offset']
      }
      this.setStatusHeaders(
        method
          ? await this.create(
              req.user,
              req.space,
              method,
              uploadId,
              req.raw,
              headers,
              sync ? { checksum: req.headers['upload-checksum'], mtime: req.headers['upload-mtime'] } : undefined
            )
          : await this.append(req.user, req.space, uploadId, req.raw, headers),
        res,
        sync
      )
    } catch (error) {
      if (error instanceof FileUploadSessionOffsetError) {
        void res.header(FILE_UPLOAD_SESSION_HEADER.OFFSET, String(error.offset))
      }
      this.setRetryAfter(error, res)
      if (req.raw.httpVersionMajor === 1) void res.header('Connection', 'close')
      throw error
    }
  }

  async create(
    user: UserModel,
    space: SpaceEnv,
    method: FileUploadSessionMethod,
    uploadId: string,
    stream: Readable,
    headers: FileUploadSessionChunkHeaders,
    metadataHeaders: FileUploadSessionMetadataHeaders = {}
  ): Promise<FileUploadSessionStatus> {
    this.assertContentType(headers.contentType)
    const size = this.parseUploadLength(headers.uploadLength)
    const uploadOffset = this.parseUploadOffset(headers.uploadOffset)
    if (uploadOffset !== 0) throw new FileUploadSessionOffsetError(0)
    const contentLength = this.parseContentLength(headers.contentLength)
    if (contentLength === 0 && size !== 0) throw new HttpException('First chunk body cannot be empty', HttpStatus.BAD_REQUEST)
    if (contentLength > size) throw new HttpException('Chunk exceeds the declared upload size', HttpStatus.PAYLOAD_TOO_LARGE)
    const maxChunkSize = configuration.applications.files.transfers.maxChunkSize
    if (maxChunkSize && contentLength > maxChunkSize) {
      throw new HttpException('Maximum chunk size exceeded', HttpStatus.PAYLOAD_TOO_LARGE)
    }
    const metadata = this.parseMetadataHeaders(metadataHeaders)
    await this.initialize(user, space, method, uploadId, { size, ...metadata })
    return this.append(user, space, uploadId, stream, headers)
  }

  append(
    user: UserModel,
    space: SpaceEnv,
    uploadId: string,
    stream: Readable,
    headers: FileUploadSessionChunkHeaders
  ): Promise<FileUploadSessionStatus> {
    this.assertContentType(headers.contentType)
    const uploadLength = this.parseUploadLength(headers.uploadLength)
    const uploadOffset = this.parseUploadOffset(headers.uploadOffset)
    const contentLength = this.parseContentLength(headers.contentLength)
    const directory = this.directoryForRequest(user, space, uploadId)
    return this.withSessionLock(directory, async () => {
      const context = await this.loadContext(user, space, uploadId, directory)
      if (uploadLength !== context.manifest.expectedSize) {
        throw new HttpException('Upload-Length does not match the upload session', HttpStatus.CONFLICT)
      }

      // The payload length is authoritative. The client offset is only a precondition and cannot skip already missing bytes.
      const offset = await this.payloadSize(context)
      if (uploadOffset !== offset) throw new FileUploadSessionOffsetError(offset)
      if (contentLength === 0) {
        if (offset !== context.manifest.expectedSize) throw new HttpException('Chunk body cannot be empty', HttpStatus.BAD_REQUEST)
        return this.publishCompleted(user, space, context)
      }
      if (contentLength > context.manifest.chunkSize) {
        throw new HttpException('Maximum chunk size exceeded', HttpStatus.PAYLOAD_TOO_LARGE)
      }
      if (contentLength > context.manifest.expectedSize - offset) {
        throw new HttpException('Chunk exceeds the declared upload size', HttpStatus.PAYLOAD_TOO_LARGE)
      }
      if (space.willExceedQuota(contentLength)) {
        throw new HttpException('Storage quota exceeded', HttpStatus.INSUFFICIENT_STORAGE)
      }

      let received = 0
      // A chunk is acknowledged only after its complete body is consumed and its resulting size is verified. No fsync is requested here;
      // physical persistence follows the operating system page-cache and writeback semantics. If the stream is interrupted, its written
      // prefix remains in payload.part and its actual size becomes the offset used for reconciliation.
      await writeFromStream(context.payload, stream, {
        start: offset,
        accountBytes: (bytes) => {
          received += bytes
          if (received > contentLength) throw new HttpException('Chunk body exceeds Content-Length', HttpStatus.BAD_REQUEST)
        }
      })
      const newOffset = await this.payloadSize(context)
      if (received !== contentLength || newOffset !== offset + contentLength) {
        throw new FileUploadSessionOffsetError(newOffset, 'Chunk body is incomplete')
      }
      if (newOffset === context.manifest.expectedSize) return this.publishCompleted(user, space, context)
      return {
        offset: newOffset,
        size: context.manifest.expectedSize,
        state: FILE_UPLOAD_SESSION_STATE.UPLOADING
      }
    })
  }

  status(user: UserModel, space: SpaceEnv, uploadId: string): Promise<FileUploadSessionStatus> {
    const directory = this.directoryForRequest(user, space, uploadId)
    return this.withSessionLock(directory, async () => {
      const context = await this.loadContext(user, space, uploadId, directory)
      const offset = await this.payloadSize(context)
      return {
        offset,
        size: context.manifest.expectedSize,
        state: offset === context.manifest.expectedSize ? FILE_UPLOAD_SESSION_STATE.READY : FILE_UPLOAD_SESSION_STATE.UPLOADING
      }
    })
  }

  async writeUploadSessionStatus(user: UserModel, space: SpaceEnv, uploadId: string, res: FastifyReply, includeIno = false): Promise<void> {
    this.setStatusHeaders(await this.withRetryAfter(this.status(user, space, uploadId), res), res, includeIno)
  }

  private async initialize(
    user: UserModel,
    space: SpaceEnv,
    method: FileUploadSessionMethod,
    uploadId: string,
    options: FileUploadSessionCreate
  ): Promise<void> {
    const maxChunkSize = configuration.applications.files.transfers.maxChunkSize
    if (!isUuidV4(uploadId)) throw new HttpException('Invalid upload identifier', HttpStatus.BAD_REQUEST)
    const temporaryRoot = temporaryRootFromSpace(user, space)
    const directory = this.sessionDirectory(temporaryRoot, uploadId)

    // The upload id is the only resumption key: a destination or filename never selects an existing payload.
    const existingDirectory = await this.lstatIfExists(directory)
    if (existingDirectory) {
      if (!existingDirectory.isDirectory()) {
        throw new HttpException('Upload identifier is already in use', HttpStatus.CONFLICT)
      }
      return this.resumeCreate(space, method, options, directory)
    }

    if (!maxChunkSize) throw new HttpException('Chunked uploads are disabled', HttpStatus.CONFLICT)
    if (options.size > configuration.applications.files.transfers.maxUploadSize) {
      throw new HttpException(FILE_ERROR.MAX_FILE_SIZE_EXCEEDED, HttpStatus.PAYLOAD_TOO_LARGE)
    }
    this.assertDestination(space)
    await this.assertDestinationFilesystem(space, method === HTTP_METHOD.PUT)
    const destinationStats = await this.lstatIfExists(space.realPath)
    if (method === HTTP_METHOD.POST && destinationStats) {
      throw new HttpException('Resource already exists', HttpStatus.METHOD_NOT_ALLOWED)
    }
    if (space.willExceedQuota(options.size)) {
      throw new HttpException('Storage quota exceeded', HttpStatus.INSUFFICIENT_STORAGE)
    }

    await makeDir(temporaryRoot, true)
    const concurrentDirectory = await this.lstatIfExists(directory)
    if (concurrentDirectory) {
      if (!concurrentDirectory.isDirectory()) {
        throw new HttpException('Upload identifier is already in use', HttpStatus.CONFLICT)
      }
      return this.resumeCreate(space, method, options, directory)
    }

    // This limit is intentionally best effort: atomic session exposure prevents duplicate ids, while rare concurrent creations may exceed the cap.
    await this.assertActiveSessionLimit(temporaryRoot)
    // Prepare the complete session off-path, then expose it atomically so readers never observe a partial manifest or a missing payload.
    const initializationDirectory = await fs.mkdtemp(`${directory}.init-`)
    try {
      const manifest: FileUploadSessionManifest = {
        version: 1,
        destination: path.resolve(space.realPath),
        method,
        expectedSize: options.size,
        chunkSize: maxChunkSize,
        ...(options.mtime !== undefined && { mtime: options.mtime }),
        ...(options.checksum && { checksum: options.checksum })
      }
      await fs.writeFile(path.join(initializationDirectory, FILE_UPLOAD_SESSION.MANIFEST), JSON.stringify(manifest), { flag: 'wx', mode: 0o600 })
      await fs.writeFile(path.join(initializationDirectory, FILE_UPLOAD_SESSION.PAYLOAD), '', { flag: 'wx' })
      await fs.rename(initializationDirectory, directory)
    } catch (error) {
      await removeFiles(initializationDirectory).catch(() => undefined)
      const exposedDirectory = await this.lstatIfExists(directory)
      if (!exposedDirectory) throw error
      if (!exposedDirectory.isDirectory()) {
        throw new HttpException('Upload identifier is already in use', HttpStatus.CONFLICT)
      }
      return this.resumeCreate(space, method, options, directory)
    }
  }

  async cleanupExpired(directory: string, expiration: number): Promise<void> {
    const stats = await this.lstatIfExists(directory)
    if (!stats?.isDirectory()) return
    const absoluteExpiration = Date.now() - FILE_UPLOAD_SESSION_MAX_AGE_MS
    const manifestPath = path.join(directory, FILE_UPLOAD_SESSION.MANIFEST)
    const manifestStats = await this.lstatIfExists(manifestPath)
    const absoluteExpired = Boolean(manifestStats?.isFile() && manifestStats.mtimeMs < absoluteExpiration)
    if (!absoluteExpired && stats.mtimeMs >= expiration) return
    try {
      await this.withSessionLock(directory, async () => {
        if (!(await this.isSessionExpired(directory, expiration, absoluteExpiration))) return
        await removeFiles(directory)
      })
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.NOT_FOUND) return
      if (error instanceof HttpException && error.getStatus() === HttpStatus.LOCKED) {
        const lockStats = await this.lstatIfExists(path.join(directory, FILE_UPLOAD_SESSION.LOCK))
        if (lockStats && lockStats.mtimeMs < expiration && (await this.isSessionExpired(directory, expiration, absoluteExpiration))) {
          // A claim abandoned for the full retention period makes only this upload fail; cleanup does not try to recover its owner.
          await removeFiles(directory)
        }
        return
      }
      throw error
    }
  }

  async cancel(user: UserModel, space: SpaceEnv, uploadId: string): Promise<void> {
    const directory = this.directoryForRequest(user, space, uploadId)
    if (!(await this.lstatIfExists(directory))) return
    // The session lock serializes deletion with writes and publication. Removing this directory never removes an already published destination.
    await this.withSessionLock(directory, async () => {
      await this.loadContext(user, space, uploadId, directory)
      await removeFiles(directory)
    })
  }

  cancelUploadSession(user: UserModel, space: SpaceEnv, uploadId: string, res: FastifyReply): Promise<void> {
    return this.withRetryAfter(this.cancel(user, space, uploadId), res)
  }

  private async publishCompleted(user: UserModel, space: SpaceEnv, context: FileUploadSessionContext): Promise<FileUploadSessionStatus> {
    if ((await this.payloadSize(context)) !== context.manifest.expectedSize) {
      throw new HttpException('Upload is incomplete', HttpStatus.CONFLICT)
    }
    if (context.manifest.checksum) {
      const checksum = await checksumFile(context.payload, DEFAULT_CHECKSUM_ALGORITHM)
      if (checksum !== context.manifest.checksum) throw new HttpException('Checksums are not identical', HttpStatus.BAD_REQUEST)
    }
    const ino = await this.publish(user, space, context)
    return {
      ino,
      offset: context.manifest.expectedSize,
      size: context.manifest.expectedSize,
      state: FILE_UPLOAD_SESSION_STATE.COMPLETE
    }
  }

  private async publish(user: UserModel, space: SpaceEnv, context: FileUploadSessionContext): Promise<number> {
    return this.withPublicationLock(user, space, this.publish.name, async () => {
      await this.assertDestinationFilesystem(space, context.manifest.method === HTTP_METHOD.PUT)
      const destinationStats = await this.lstatIfExists(space.realPath)
      this.assertCompletionPermission(space, context.manifest.method)
      if (context.manifest.method === HTTP_METHOD.POST && destinationStats) {
        throw new HttpException('Resource already exists', HttpStatus.METHOD_NOT_ALLOWED)
      }

      if (context.manifest.method === HTTP_METHOD.PUT) await this.filesManager.prepareUploadOverwriteDestination(user, space)
      await makeDir(dirName(space.realPath), true)
      await this.assertDestinationFilesystem(space)
      if (context.manifest.mtime !== undefined) await fs.utimes(context.payload, context.manifest.mtime, context.manifest.mtime)
      const action = destinationStats && !destinationStats.isDirectory() ? ACTION.UPDATE : ACTION.ADD

      try {
        await moveFiles(context.payload, space.realPath, context.manifest.method === HTTP_METHOD.PUT)
      } catch (error) {
        if (this.isMoveDestinationExistsError(error, space.realPath)) {
          throw new HttpException('Resource already exists', HttpStatus.METHOD_NOT_ALLOWED)
        }
        throw error
      }

      if (context.manifest.mtime !== undefined) await fs.utimes(space.realPath, context.manifest.mtime, context.manifest.mtime)
      const stats = await fs.lstat(space.realPath)
      if (!stats.isFile() || stats.size !== context.manifest.expectedSize) {
        throw new HttpException('Published upload is invalid', HttpStatus.INTERNAL_SERVER_ERROR)
      }
      try {
        FileEvent.emit('event', { user, space, action, rPath: space.realPath })
      } finally {
        await removeFiles(context.directory)
      }
      return stats.ino
    })
  }

  private async withPublicationLock<T>(user: UserModel, space: SpaceEnv, tag: string, operation: () => Promise<T>): Promise<T> {
    // A session lock protects one upload id; publication reuses the multipart destination lock to reject conflicting owners.
    let created: boolean
    let fileLock: FileLock
    try {
      const publicationLock = await this.filesLockManager.createOrRefresh(user, space.dbFile, SERVER_NAME, DEPTH.RESOURCE)
      created = publicationLock[0]
      fileLock = publicationLock[1]
    } catch (error) {
      if (error instanceof LockConflict) throw new HttpException('The file is locked', HttpStatus.LOCKED)
      throw error
    }
    try {
      return await operation()
    } catch (error) {
      if (error instanceof LockConflict) throw new HttpException('The file is locked', HttpStatus.LOCKED)
      throw error
    } finally {
      if (created) {
        await this.filesLockManager
          .removeLock(space.dbFile, fileLock)
          .catch((error) => this.logger.warn({ tag, msg: `Unable to release file lock: ${String(error)}` }))
      }
    }
  }

  private async resumeCreate(space: SpaceEnv, method: FileUploadSessionMethod, options: FileUploadSessionCreate, directory: string): Promise<void> {
    return this.withSessionLock(directory, async () => {
      const manifest = await this.readManifest(directory)
      // Reusing an id is resumable only when every immutable creation parameter still describes the same upload.
      if (!this.matchesCreate(manifest, space, method, options)) {
        throw new HttpException('Upload identifier is already in use', HttpStatus.CONFLICT)
      }
      const context = this.contextFromManifest(directory, manifest)
      await touchFile(context.payload)
    })
  }

  private matchesCreate(
    manifest: FileUploadSessionManifest,
    space: SpaceEnv,
    method: FileUploadSessionMethod,
    options: FileUploadSessionCreate
  ): boolean {
    return (
      manifest.destination === path.resolve(space.realPath) &&
      manifest.method === method &&
      manifest.expectedSize === options.size &&
      manifest.mtime === options.mtime &&
      manifest.checksum === options.checksum
    )
  }

  private async loadContext(
    user: UserModel,
    space: SpaceEnv,
    uploadId: string,
    directory = this.directoryForRequest(user, space, uploadId)
  ): Promise<FileUploadSessionContext> {
    const stats = await this.lstatIfExists(directory)
    if (!stats?.isDirectory()) throw new HttpException('Upload session not found', HttpStatus.NOT_FOUND)
    const manifest = await this.readManifest(directory)
    // Bind the id to its original destination and do not reveal a session presented through another route.
    if (manifest.destination !== path.resolve(space.realPath)) {
      throw new HttpException('Upload session not found', HttpStatus.NOT_FOUND)
    }
    return this.contextFromManifest(directory, manifest)
  }

  private contextFromManifest(directory: string, manifest: FileUploadSessionManifest): FileUploadSessionContext {
    return {
      directory,
      payload: path.join(directory, FILE_UPLOAD_SESSION.PAYLOAD),
      manifest
    }
  }

  private async payloadSize(context: FileUploadSessionContext): Promise<number> {
    return (await this.payloadStats(context)).size
  }

  private async payloadStats(context: FileUploadSessionContext) {
    const stats = await this.lstatIfExists(context.payload)
    if (!stats) throw new HttpException('Upload session payload is missing', HttpStatus.CONFLICT)
    if (!stats.isFile() || stats.size > context.manifest.expectedSize) {
      throw new HttpException('Upload session payload is invalid', HttpStatus.CONFLICT)
    }
    return stats
  }

  private async withSessionLock<T>(directory: string, operation: () => Promise<T>): Promise<T> {
    const stats = await this.lstatIfExists(directory)
    if (!stats?.isDirectory()) throw new HttpException('Upload session not found', HttpStatus.NOT_FOUND)
    const lockPath = path.join(directory, FILE_UPLOAD_SESSION.LOCK)
    const lock = crypto.randomUUID()
    try {
      await fs.writeFile(lockPath, lock, { flag: 'wx', mode: 0o600 })
    } catch (error) {
      if (this.isMissingPathError(error)) {
        throw new HttpException('Upload session not found', HttpStatus.NOT_FOUND)
      }
      if (this.isErrorCode(error, 'EEXIST')) throw new HttpException('Upload session is busy', HttpStatus.LOCKED)
      throw error
    }
    try {
      return await operation()
    } finally {
      await this.releaseSessionLock(lockPath, lock)
    }
  }

  private async releaseSessionLock(lockPath: string, lock: string): Promise<void> {
    try {
      if ((await fs.readFile(lockPath, 'utf8')) === lock) await fs.rm(lockPath)
    } catch (error) {
      if (!this.isMissingPathError(error)) {
        this.logger.warn({ tag: this.releaseSessionLock.name, msg: `Unable to release upload session lock: ${String(error)}` })
      }
    }
  }

  private async isSessionExpired(directory: string, expiration: number, absoluteExpiration: number): Promise<boolean> {
    const manifestStats = await this.lstatIfExists(path.join(directory, FILE_UPLOAD_SESSION.MANIFEST))
    if (manifestStats?.isFile() && manifestStats.mtimeMs < absoluteExpiration) return true
    // Writing payload contents does not update the directory mtime, so inspect every mutable session entry before deleting it.
    const activity = await Promise.all(
      [FILE_UPLOAD_SESSION.MANIFEST, FILE_UPLOAD_SESSION.PAYLOAD].map((entry) => this.lstatIfExists(path.join(directory, entry)))
    )
    return !activity.some((entry) => entry && entry.mtimeMs >= expiration)
  }

  private parseUploadHeader<T>(parse: () => T): T {
    try {
      return parse()
    } catch (error) {
      if (error instanceof FileError) throw new HttpException(error.message, error.httpCode)
      throw error
    }
  }

  private assertContentType(value: unknown): void {
    if (typeof value !== 'string' || value.split(';', 1)[0].trim().toLowerCase() !== DEFAULT_MIME_TYPE) {
      throw new HttpException(`Content-Type must be ${DEFAULT_MIME_TYPE}`, HttpStatus.UNSUPPORTED_MEDIA_TYPE)
    }
  }

  private async withRetryAfter<T>(operation: Promise<T>, res: FastifyReply): Promise<T> {
    try {
      return await operation
    } catch (error) {
      this.setRetryAfter(error, res)
      throw error
    }
  }

  private setRetryAfter(error: unknown, res: FastifyReply): void {
    if (error instanceof HttpException && error.getStatus() === HttpStatus.LOCKED) {
      void res.header('Retry-After', '2')
    }
  }

  private setStatusHeaders(status: FileUploadSessionStatus, res: FastifyReply, includeIno = false): void {
    if (includeIno && status.ino !== undefined) void res.header(FILE_UPLOAD_SESSION_HEADER.INO, String(status.ino))
    void res.header(FILE_UPLOAD_SESSION_HEADER.OFFSET, String(status.offset))
    void res.header(FILE_UPLOAD_SESSION_HEADER.LENGTH, String(status.size))
    void res.header(FILE_UPLOAD_SESSION_HEADER.STATE, status.state)
  }

  private parseUploadOffset(value: unknown): number {
    const offset = this.parseUploadHeader(() => parseUnsignedIntegerHeader(value, 'Invalid Upload-Offset header'))
    if (offset === undefined) throw new HttpException('Upload-Offset header is required', HttpStatus.BAD_REQUEST)
    return offset
  }

  private parseUploadLength(value: unknown): number {
    const length = this.parseUploadHeader(() => parseUnsignedIntegerHeader(value, 'Invalid Upload-Length header'))
    if (length === undefined) throw new HttpException('Upload-Length header is required', HttpStatus.BAD_REQUEST)
    return length
  }

  private parseContentLength(value: unknown): number {
    const length = this.parseUploadHeader(() => parseContentLength(value))
    if (length === undefined) throw new HttpException('Content-Length header is required', HttpStatus.BAD_REQUEST)
    return length
  }

  private parseMetadataHeaders(headers: FileUploadSessionMetadataHeaders): FileUploadSessionMetadata {
    let checksum: string | undefined
    if (headers.checksum !== undefined) {
      if (typeof headers.checksum !== 'string' || !CHECKSUM_PATTERN.test(headers.checksum)) {
        throw new HttpException('Invalid Upload-Checksum header', HttpStatus.BAD_REQUEST)
      }
      checksum = headers.checksum.toLowerCase()
    }
    const mtime = this.parseUploadHeader(() => parseUnsignedIntegerHeader(headers.mtime, 'Invalid Upload-Mtime header'))
    return {
      ...(checksum && { checksum }),
      ...(mtime !== undefined && { mtime })
    }
  }

  private assertCompletionPermission(space: SpaceEnv, method: FileUploadSessionMethod): void {
    const permission = method === HTTP_METHOD.PUT ? SPACE_OPERATION.MODIFY : SPACE_OPERATION.ADD
    if (!haveSpaceEnvPermissions(space, permission)) throw new HttpException('You are not allowed to complete this upload', HttpStatus.FORBIDDEN)
    if (space.inTrashRepository) throw new HttpException('The trash is read-only', HttpStatus.FORBIDDEN)
  }

  private assertDestination(space: SpaceEnv): void {
    if (!isPathInside(space.realBasePath, space.realPath)) throw new HttpException('Upload destination is not allowed', HttpStatus.FORBIDDEN)
    try {
      checkFileName(space.realPath)
    } catch {
      throw new HttpException('Upload destination is invalid', HttpStatus.BAD_REQUEST)
    }
  }

  private async assertDestinationFilesystem(space: SpaceEnv, allowOverwriteConflict = false): Promise<void> {
    // PUT mirrors multipart by allowing only the immediate parent file to be removed after the payload is fully staged.
    const segments = path.relative(path.resolve(space.realBasePath), path.resolve(space.realPath)).split(path.sep).filter(Boolean)
    let candidatePath = path.resolve(space.realBasePath)
    for (let index = 0; index < segments.length; index++) {
      candidatePath = path.join(candidatePath, segments[index])
      const stats = await this.lstatIfExists(candidatePath)
      if (!stats) break
      if (stats.isSymbolicLink()) throw new HttpException('Upload path cannot contain symbolic links', HttpStatus.CONFLICT)
      if (index < segments.length - 1 && !stats.isDirectory()) {
        if (allowOverwriteConflict && index === segments.length - 2) return
        throw new HttpException('Upload path contains a file ancestor', HttpStatus.CONFLICT)
      }
    }
  }

  private directoryForRequest(user: UserModel, space: SpaceEnv, uploadId: string): string {
    this.assertUploadId(uploadId)
    this.assertDestination(space)
    const temporaryRoot = temporaryRootFromSpace(user, space)
    const directory = this.sessionDirectory(temporaryRoot, uploadId)
    if (!isPathInside(temporaryRoot, directory)) throw new HttpException('Upload session not found', HttpStatus.NOT_FOUND)
    return directory
  }

  private sessionDirectory(temporaryRoot: string, uploadId: string): string {
    return temporaryFilePath(temporaryRoot, FILE_UPLOAD_SESSION.DIRECTORY_TARGET, FILE_OPERATION.UPLOAD, uploadId)
  }

  private async assertActiveSessionLimit(temporaryRoot: string): Promise<void> {
    const entries = await fs.readdir(temporaryRoot, { withFileTypes: true })
    let activeSessions = 0
    for (const entry of entries) {
      if (!entry.isDirectory() || !isFileUploadSessionDirectoryName(entry.name)) continue
      activeSessions++
      if (activeSessions >= FILE_UPLOAD_SESSION_MAX_ACTIVE_PER_ACTOR) {
        throw new HttpException('Maximum active upload sessions exceeded', HttpStatus.TOO_MANY_REQUESTS)
      }
    }
  }

  private async readManifest(directory: string): Promise<FileUploadSessionManifest> {
    const manifest = await this.readJson(path.join(directory, FILE_UPLOAD_SESSION.MANIFEST), 'Upload session metadata is invalid')
    if (!this.isManifest(manifest)) throw new HttpException('Upload session metadata is invalid', HttpStatus.CONFLICT)
    return manifest
  }

  private async readJson(filePath: string, errorMessage: string): Promise<unknown> {
    try {
      return JSON.parse(await fs.readFile(filePath, 'utf8'))
    } catch {
      throw new HttpException(errorMessage, HttpStatus.CONFLICT)
    }
  }

  private readonly isManifest = (value: unknown): value is FileUploadSessionManifest =>
    this.isRecord(value) &&
    value.version === 1 &&
    typeof value.destination === 'string' &&
    (value.method === HTTP_METHOD.POST || value.method === HTTP_METHOD.PUT) &&
    Number.isSafeInteger(value.expectedSize) &&
    (value.expectedSize as number) >= 0 &&
    Number.isSafeInteger(value.chunkSize) &&
    (value.chunkSize as number) > 0 &&
    (value.mtime === undefined || (Number.isSafeInteger(value.mtime) && (value.mtime as number) >= 0)) &&
    (value.checksum === undefined ||
      (typeof value.checksum === 'string' && CHECKSUM_PATTERN.test(value.checksum) && value.checksum === value.checksum.toLowerCase()))

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }

  private assertUploadId(uploadId: string): void {
    if (!isUuidV4(uploadId)) throw new HttpException('Upload session not found', HttpStatus.NOT_FOUND)
  }

  private isErrorCode(error: unknown, code: string): boolean {
    return error instanceof Error && (error as NodeJS.ErrnoException).code === code
  }

  private isMissingPathError(error: unknown): boolean {
    return this.isErrorCode(error, 'ENOENT') || this.isErrorCode(error, 'ENOTDIR')
  }

  private isMoveDestinationExistsError(error: unknown, destination: string): boolean {
    return (
      this.isErrorCode(error, 'EEXIST') ||
      (error instanceof Error && (error.message === 'dest already exists.' || error.message === `'${destination}' already exists`))
    )
  }

  private async lstatIfExists(rPath: string) {
    try {
      return await fs.lstat(rPath)
    } catch (error) {
      if (this.isMissingPathError(error)) return
      throw error
    }
  }
}
