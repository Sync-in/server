import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import crypto from 'node:crypto'
import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { ACTION } from '../../../../common/constants.js'
import { SERVER_NAME } from '../../../../common/shared.js'
import { CHECKSUM_PATTERN, isUuidV4 } from '../../../../common/validation.js'
import { configuration } from '../../../../configuration/config.environment.js'
import { HTTP_METHOD } from '../../../applications.constants.js'
import { SPACE_OPERATION } from '../../../spaces/constants/spaces.js'
import type { FastifySpaceRequest } from '../../../spaces/interfaces/space-request.interface.js'
import type { SpaceEnv } from '../../../spaces/models/space-env.model.js'
import { ensureTemporaryRootFromSpace, existingTemporaryRootFromSpace } from '../../../spaces/utils/paths.js'
import { haveSpaceEnvPermissions } from '../../../spaces/utils/permissions.js'
import type { UserModel } from '../../../users/models/user.model.js'
import { DEPTH } from '../../../webdav/constants/webdav.js'
import { FILE_ERROR } from '../../core/constants/errors.js'
import { DEFAULT_CHECKSUM_ALGORITHM, DEFAULT_HIGH_WATER_MARK, DEFAULT_MIME_TYPE } from '../../core/constants/files.js'
import {
  FILE_UPLOAD_SESSION,
  FILE_UPLOAD_SESSION_CHECKSUM_MODE,
  FILE_UPLOAD_SESSION_CHECKSUM_SIZE,
  FILE_UPLOAD_SESSION_HEADER,
  FILE_UPLOAD_SESSION_MAX_AGE_MS,
  FILE_UPLOAD_SESSION_PERSISTED_STATE_VERSION,
  FILE_UPLOAD_SESSION_STATE
} from '../constants/upload-session.js'
import { FileEvent } from '../../core/events/file-events.js'
import type {
  FileUploadSessionChecksumMode,
  FileUploadSessionChunkHeaders,
  FileUploadSessionContext,
  FileUploadSessionCreate,
  FileUploadSessionManifest,
  FileUploadSessionMetadata,
  FileUploadSessionMetadataHeaders,
  FileUploadSessionMethod,
  FileUploadSessionPersistentState,
  FileUploadSessionStatus
} from '../interfaces/file-upload-session.interface.js'
import { FileUploadSessionOffsetError } from '../models/file-upload-session-offset-error.js'
import { fileUploadSessionDirectoryName } from '../utils/upload-session.js'
import { FileError } from '../../core/models/file-error.js'
import {
  checkFileName,
  checksumFile,
  dirName,
  isPathInside,
  makeDir,
  moveFiles,
  removeFiles,
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
        uploadLength: req.headers[FILE_UPLOAD_SESSION_HEADER.LENGTH],
        uploadOffset: req.headers[FILE_UPLOAD_SESSION_HEADER.OFFSET]
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
              sync
                ? {
                    checksum: req.headers[FILE_UPLOAD_SESSION_HEADER.CHECKSUM],
                    mtime: req.headers[FILE_UPLOAD_SESSION_HEADER.MTIME]
                  }
                : undefined,
              sync
            )
          : await this.append(req.user, req.space, uploadId, req.raw, headers, sync),
        res,
        sync
      )
    } catch (error) {
      if (error instanceof FileUploadSessionOffsetError) {
        void res.header(FILE_UPLOAD_SESSION_HEADER.OFFSET, String(error.offset))
        if (error.validatedOffset !== undefined) {
          void res.header(FILE_UPLOAD_SESSION_HEADER.VALIDATED_OFFSET, String(error.validatedOffset))
        }
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
    metadataHeaders: FileUploadSessionMetadataHeaders = {},
    sync = false
  ): Promise<FileUploadSessionStatus> {
    this.assertContentType(headers.contentType)
    const size = this.parseUploadLength(headers.uploadLength)
    const uploadOffset = this.parseUploadOffset(headers.uploadOffset)
    if (uploadOffset !== 0) throw new FileUploadSessionOffsetError(0, undefined, sync ? 0 : undefined)
    const contentLength = this.parseContentLength(headers.contentLength)
    const metadata = this.parseMetadataHeaders(metadataHeaders)
    const checksumMode = sync
      ? metadata.checksum
        ? FILE_UPLOAD_SESSION_CHECKSUM_MODE.CHUNK_SUFFIX
        : FILE_UPLOAD_SESSION_CHECKSUM_MODE.SYNC_RAW
      : undefined
    const payloadLength = this.payloadContentLength(contentLength, checksumMode)
    if (payloadLength === 0 && size !== 0) throw new HttpException('First chunk body cannot be empty', HttpStatus.BAD_REQUEST)
    if (payloadLength > size) throw new HttpException('Chunk exceeds the declared upload size', HttpStatus.PAYLOAD_TOO_LARGE)
    await this.initialize(user, space, method, uploadId, { size, ...metadata, ...(checksumMode && { checksumMode }) })
    return this.append(user, space, uploadId, stream, headers, sync)
  }

  append(
    user: UserModel,
    space: SpaceEnv,
    uploadId: string,
    stream: Readable,
    headers: FileUploadSessionChunkHeaders,
    sync = false
  ): Promise<FileUploadSessionStatus> {
    this.assertContentType(headers.contentType)
    const uploadLength = this.parseUploadLength(headers.uploadLength)
    const uploadOffset = this.parseUploadOffset(headers.uploadOffset)
    const contentLength = this.parseContentLength(headers.contentLength)
    return this.directoryForRequest(user, space, uploadId).then((directory) =>
      this.withSessionLock(directory, async () => {
        const context = await this.loadLockedContext(space, directory)
        if (uploadLength !== context.manifest.expectedSize) {
          throw new HttpException('upload-length does not match the upload session', HttpStatus.CONFLICT)
        }
        if (sync !== (context.manifest.checksumMode !== undefined)) {
          throw new HttpException('Upload session mode does not match', HttpStatus.CONFLICT)
        }

        // The payload length is authoritative. The client offset is only a precondition and cannot skip already missing bytes.
        const offset = await this.payloadSize(context)
        if (uploadOffset !== offset) {
          throw new FileUploadSessionOffsetError(
            offset,
            undefined,
            context.manifest.checksumMode === FILE_UPLOAD_SESSION_CHECKSUM_MODE.SYNC_RAW ? offset : undefined
          )
        }
        if (contentLength === 0) {
          if (offset !== context.manifest.expectedSize) throw new HttpException('Chunk body cannot be empty', HttpStatus.BAD_REQUEST)
          return this.publishCompleted(user, space, context)
        }
        const payloadLength = this.payloadContentLength(contentLength, context.manifest.checksumMode)
        if (payloadLength > context.manifest.expectedSize - offset) {
          throw new HttpException('Chunk exceeds the declared upload size', HttpStatus.PAYLOAD_TOO_LARGE)
        }
        if (payloadLength > 0 && space.willExceedQuota(payloadLength)) {
          throw new HttpException('Storage quota exceeded', HttpStatus.INSUFFICIENT_STORAGE)
        }

        if (context.manifest.checksumMode === FILE_UPLOAD_SESSION_CHECKSUM_MODE.CHUNK_SUFFIX) {
          return this.appendChecksummedChunk(user, space, context, stream, contentLength, payloadLength, offset)
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
          throw new FileUploadSessionOffsetError(
            newOffset,
            'Chunk body is incomplete',
            context.manifest.checksumMode === FILE_UPLOAD_SESSION_CHECKSUM_MODE.SYNC_RAW ? newOffset : undefined
          )
        }
        if (newOffset === context.manifest.expectedSize) return this.publishCompleted(user, space, context)
        return {
          offset: newOffset,
          size: context.manifest.expectedSize,
          state: FILE_UPLOAD_SESSION_STATE.UPLOADING,
          ...(context.manifest.checksumMode === FILE_UPLOAD_SESSION_CHECKSUM_MODE.SYNC_RAW && { validatedOffset: newOffset })
        }
      })
    )
  }

  private async appendChecksummedChunk(
    user: UserModel,
    space: SpaceEnv,
    context: FileUploadSessionContext,
    stream: Readable,
    contentLength: number,
    payloadLength: number,
    offset: number
  ): Promise<FileUploadSessionStatus> {
    const persistentState = await this.readPersistentState(context, offset)
    const validatedOffset = persistentState.validatedOffset
    if (payloadLength === 0 && validatedOffset === offset && offset !== context.manifest.expectedSize) {
      throw new HttpException('Chunk body cannot be empty', HttpStatus.BAD_REQUEST)
    }

    const hash = crypto.createHash(DEFAULT_CHECKSUM_ALGORITHM)
    if (validatedOffset < offset) {
      const pending = createReadStream(context.payload, {
        start: validatedOffset,
        end: offset - 1,
        highWaterMark: DEFAULT_HIGH_WATER_MARK
      })
      for await (const chunk of pending) hash.update(chunk)
    }

    let payloadReceived = 0
    let received = 0
    let checksumReceived = 0
    const expectedChecksum = Buffer.alloc(FILE_UPLOAD_SESSION_CHECKSUM_SIZE)
    const payloadStream = Readable.from(
      (async function* () {
        for await (const value of stream) {
          const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value)
          received += chunk.length
          if (received > contentLength) throw new HttpException('Chunk body exceeds Content-Length', HttpStatus.BAD_REQUEST)

          const payloadBytes = Math.min(payloadLength - payloadReceived, chunk.length)
          if (payloadBytes > 0) {
            const payloadChunk = chunk.subarray(0, payloadBytes)
            payloadReceived += payloadBytes
            hash.update(payloadChunk)
            yield payloadChunk
          }

          const checksumChunk = chunk.subarray(payloadBytes)
          if (checksumChunk.length > 0) {
            if (checksumReceived + checksumChunk.length > FILE_UPLOAD_SESSION_CHECKSUM_SIZE) {
              throw new HttpException('Chunk checksum exceeds its declared size', HttpStatus.BAD_REQUEST)
            }
            checksumChunk.copy(expectedChecksum, checksumReceived)
            checksumReceived += checksumChunk.length
          }
        }
      })(),
      { objectMode: false }
    )

    await writeFromStream(context.payload, payloadStream, { start: offset })
    const newOffset = await this.payloadSize(context)
    if (
      received !== contentLength ||
      payloadReceived !== payloadLength ||
      checksumReceived !== FILE_UPLOAD_SESSION_CHECKSUM_SIZE ||
      newOffset !== offset + payloadLength
    ) {
      throw new FileUploadSessionOffsetError(newOffset, 'Chunk body is incomplete', validatedOffset)
    }

    const checksum = hash.digest()
    if (!crypto.timingSafeEqual(checksum, expectedChecksum)) {
      await fs.truncate(context.payload, validatedOffset)
      throw new HttpException('Checksums are not identical', HttpStatus.BAD_REQUEST)
    }

    await this.writePersistentState(context, {
      validatedOffset: newOffset,
      version: FILE_UPLOAD_SESSION_PERSISTED_STATE_VERSION
    })
    if (newOffset === context.manifest.expectedSize) return this.publishCompleted(user, space, context)
    return {
      offset: newOffset,
      size: context.manifest.expectedSize,
      state: FILE_UPLOAD_SESSION_STATE.UPLOADING,
      validatedOffset: newOffset
    }
  }

  status(user: UserModel, space: SpaceEnv, uploadId: string): Promise<FileUploadSessionStatus> {
    return this.directoryForRequest(user, space, uploadId).then((directory) =>
      this.withSessionLock(directory, async () => {
        const context = await this.loadLockedContext(space, directory)
        const offset = await this.payloadSize(context)
        const persistentState =
          context.manifest.checksumMode === FILE_UPLOAD_SESSION_CHECKSUM_MODE.CHUNK_SUFFIX
            ? await this.readPersistentState(context, offset)
            : undefined
        return {
          offset,
          size: context.manifest.expectedSize,
          state:
            offset === context.manifest.expectedSize && (!persistentState || persistentState.validatedOffset === offset)
              ? FILE_UPLOAD_SESSION_STATE.READY
              : FILE_UPLOAD_SESSION_STATE.UPLOADING,
          ...(persistentState && { validatedOffset: persistentState.validatedOffset }),
          ...(context.manifest.checksumMode === FILE_UPLOAD_SESSION_CHECKSUM_MODE.SYNC_RAW && { validatedOffset: offset })
        }
      })
    )
  }

  async writeUploadSessionStatus(user: UserModel, space: SpaceEnv, uploadId: string, res: FastifyReply): Promise<void> {
    this.setStatusHeaders(await this.withRetryAfter(this.status(user, space, uploadId), res), res)
  }

  private async initialize(
    user: UserModel,
    space: SpaceEnv,
    method: FileUploadSessionMethod,
    uploadId: string,
    options: FileUploadSessionCreate
  ): Promise<void> {
    if (!isUuidV4(uploadId)) throw new HttpException('Invalid upload identifier', HttpStatus.BAD_REQUEST)
    const temporaryRoot = await ensureTemporaryRootFromSpace(user, space)
    const directory = this.sessionDirectory(temporaryRoot, user.id, uploadId)

    // The upload id is the only resumption key: a destination or filename never selects an existing payload.
    const existingDirectory = await this.lstatIfExists(directory)
    if (existingDirectory) {
      if (!existingDirectory.isDirectory()) {
        throw new HttpException('Upload identifier is already in use', HttpStatus.CONFLICT)
      }
      return this.resumeCreate(space, method, options, directory)
    }

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

    // Prepare the complete session off-path, then expose it atomically so readers never observe a partial manifest or a missing payload.
    const initializationDirectory = await fs.mkdtemp(`${directory}.init-`)
    try {
      const manifest: FileUploadSessionManifest = {
        destination: path.resolve(space.realPath),
        method,
        expectedSize: options.size,
        ...(options.mtime !== undefined && { mtime: options.mtime }),
        ...(options.checksum && { checksum: options.checksum }),
        ...(options.checksumMode && { checksumMode: options.checksumMode })
      }
      await fs.writeFile(path.join(initializationDirectory, FILE_UPLOAD_SESSION.MANIFEST), JSON.stringify(manifest), { flag: 'wx', mode: 0o600 })
      await fs.writeFile(path.join(initializationDirectory, FILE_UPLOAD_SESSION.PAYLOAD), '', { flag: 'wx' })
      if (options.checksumMode === FILE_UPLOAD_SESSION_CHECKSUM_MODE.CHUNK_SUFFIX) {
        const persistentState: FileUploadSessionPersistentState = {
          validatedOffset: 0,
          version: FILE_UPLOAD_SESSION_PERSISTED_STATE_VERSION
        }
        await fs.writeFile(path.join(initializationDirectory, FILE_UPLOAD_SESSION.STATE), JSON.stringify(persistentState), {
          flag: 'wx',
          mode: 0o600
        })
      }
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
    if (!stats) return
    if (!stats.isDirectory()) {
      // A malformed entry may still match the session naming convention; keep the normal retention behavior for it.
      if (stats.mtimeMs < expiration) await removeFiles(directory)
      return
    }
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
    const directory = await this.directoryForRequest(user, space, uploadId)
    if (!(await this.lstatIfExists(directory))) return
    // The session lock serializes deletion with writes and publication. Removing this directory never removes an already published destination.
    await this.withSessionLock(directory, async () => {
      await this.loadLockedContext(space, directory)
      await removeFiles(directory)
    })
  }

  cancelUploadSession(user: UserModel, space: SpaceEnv, uploadId: string, res: FastifyReply): Promise<void> {
    return this.withRetryAfter(this.cancel(user, space, uploadId), res)
  }

  private async publishCompleted(user: UserModel, space: SpaceEnv, context: FileUploadSessionContext): Promise<FileUploadSessionStatus> {
    const offset = await this.payloadSize(context)
    if (offset !== context.manifest.expectedSize) {
      throw new HttpException('Upload is incomplete', HttpStatus.CONFLICT)
    }
    const persistentState =
      context.manifest.checksumMode === FILE_UPLOAD_SESSION_CHECKSUM_MODE.CHUNK_SUFFIX ? await this.readPersistentState(context, offset) : undefined
    if (persistentState && persistentState.validatedOffset !== offset) {
      throw new HttpException('Upload chunk is not validated', HttpStatus.CONFLICT)
    }
    if (context.manifest.checksum && context.manifest.checksumMode !== FILE_UPLOAD_SESSION_CHECKSUM_MODE.CHUNK_SUFFIX) {
      const checksum = await checksumFile(context.payload, DEFAULT_CHECKSUM_ALGORITHM)
      if (checksum !== context.manifest.checksum) throw new HttpException('Checksums are not identical', HttpStatus.BAD_REQUEST)
    }
    const ino = await this.publish(user, space, context)
    return {
      ino,
      offset: context.manifest.expectedSize,
      size: context.manifest.expectedSize,
      state: FILE_UPLOAD_SESSION_STATE.COMPLETE,
      ...(persistentState && { validatedOffset: persistentState.validatedOffset }),
      ...(context.manifest.checksumMode === FILE_UPLOAD_SESSION_CHECKSUM_MODE.SYNC_RAW && { validatedOffset: offset })
    }
  }

  private publish(user: UserModel, space: SpaceEnv, context: FileUploadSessionContext): Promise<number> {
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

      try {
        if (context.manifest.mtime !== undefined) await fs.utimes(space.realPath, context.manifest.mtime, context.manifest.mtime)
        const stats = await fs.lstat(space.realPath)
        if (!stats.isFile() || stats.size !== context.manifest.expectedSize) {
          throw new HttpException('Published upload is invalid', HttpStatus.INTERNAL_SERVER_ERROR)
        }
        FileEvent.emit('event', { user, space, action, rPath: space.realPath })
        return stats.ino
      } finally {
        await removeFiles(context.directory).catch((error: unknown) =>
          this.logger.warn({ tag: this.publish.name, msg: `Unable to remove completed upload session: ${String(error)}` })
        )
      }
    })
  }

  private async withPublicationLock<T>(user: UserModel, space: SpaceEnv, tag: string, operation: () => Promise<T>): Promise<T> {
    // A session lock protects one upload id; publication requires a non-reentrant destination lock across upload ids.
    let fileLock: FileLock
    try {
      const [created, lock] = await this.filesLockManager.create(user, space.dbFile, SERVER_NAME, DEPTH.RESOURCE)
      if (!created) throw new LockConflict(lock, 'Conflicting lock')
      fileLock = lock
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
      await this.filesLockManager
        .removeLock(space.dbFile, fileLock)
        .catch((error) => this.logger.warn({ tag, msg: `Unable to release file lock: ${String(error)}` }))
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
      manifest.checksum === options.checksum &&
      manifest.checksumMode === options.checksumMode
    )
  }

  private async loadLockedContext(space: SpaceEnv, directory: string): Promise<FileUploadSessionContext> {
    // withSessionLock already validated the directory before acquiring its lock; avoid another lstat for every request.
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
      state: path.join(directory, FILE_UPLOAD_SESSION.STATE),
      manifest
    }
  }

  private async readPersistentState(context: FileUploadSessionContext, payloadSize: number): Promise<FileUploadSessionPersistentState> {
    const state = await this.readJson(context.state, 'Upload session state is invalid')
    if (
      !this.isRecord(state) ||
      state.version !== FILE_UPLOAD_SESSION_PERSISTED_STATE_VERSION ||
      typeof state.validatedOffset !== 'number' ||
      !Number.isSafeInteger(state.validatedOffset) ||
      state.validatedOffset < 0 ||
      state.validatedOffset > payloadSize
    ) {
      throw new HttpException('Upload session state is invalid', HttpStatus.CONFLICT)
    }
    return {
      validatedOffset: state.validatedOffset,
      version: FILE_UPLOAD_SESSION_PERSISTED_STATE_VERSION
    }
  }

  private async writePersistentState(context: FileUploadSessionContext, state: FileUploadSessionPersistentState): Promise<void> {
    const temporaryState = `${context.state}.${crypto.randomUUID()}.tmp`
    try {
      await fs.writeFile(temporaryState, JSON.stringify(state), { flag: 'wx', mode: 0o600 })
      await fs.rename(temporaryState, context.state)
    } catch (error) {
      await fs.rm(temporaryState, { force: true }).catch(() => undefined)
      throw error
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
      [FILE_UPLOAD_SESSION.MANIFEST, FILE_UPLOAD_SESSION.PAYLOAD, FILE_UPLOAD_SESSION.STATE].map((entry) =>
        this.lstatIfExists(path.join(directory, entry))
      )
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
    if (status.validatedOffset !== undefined) {
      void res.header(FILE_UPLOAD_SESSION_HEADER.VALIDATED_OFFSET, String(status.validatedOffset))
    }
  }

  private parseUploadOffset(value: unknown): number {
    const offset = this.parseUploadHeader(() => parseUnsignedIntegerHeader(value, 'Invalid upload-offset header'))
    if (offset === undefined) throw new HttpException('upload-offset header is required', HttpStatus.BAD_REQUEST)
    return offset
  }

  private parseUploadLength(value: unknown): number {
    const length = this.parseUploadHeader(() => parseUnsignedIntegerHeader(value, 'Invalid upload-length header'))
    if (length === undefined) throw new HttpException('upload-length header is required', HttpStatus.BAD_REQUEST)
    return length
  }

  private parseContentLength(value: unknown): number {
    const length = this.parseUploadHeader(() => parseContentLength(value))
    if (length === undefined) throw new HttpException('Content-Length header is required', HttpStatus.BAD_REQUEST)
    return length
  }

  private payloadContentLength(contentLength: number, checksumMode?: FileUploadSessionChecksumMode): number {
    if (checksumMode !== FILE_UPLOAD_SESSION_CHECKSUM_MODE.CHUNK_SUFFIX) return contentLength
    if (contentLength === 0) return 0
    if (contentLength < FILE_UPLOAD_SESSION_CHECKSUM_SIZE) {
      throw new HttpException('Chunk checksum is missing', HttpStatus.BAD_REQUEST)
    }
    return contentLength - FILE_UPLOAD_SESSION_CHECKSUM_SIZE
  }

  private parseMetadataHeaders(headers: FileUploadSessionMetadataHeaders): FileUploadSessionMetadata {
    let checksum: string | undefined
    if (headers.checksum !== undefined) {
      if (typeof headers.checksum !== 'string' || !CHECKSUM_PATTERN.test(headers.checksum)) {
        throw new HttpException('Invalid upload-checksum header', HttpStatus.BAD_REQUEST)
      }
      checksum = headers.checksum.toLowerCase()
    }
    const mtime = this.parseUploadHeader(() => this.parseSignedIntegerHeader(headers.mtime, 'Invalid upload-mtime header'))
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

  private parseSignedIntegerHeader(value: unknown, invalidHeaderMessage: string): number | undefined {
    if (value === undefined || value === null) return undefined
    const normalized = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : ''
    if (!/^-?\d+$/.test(normalized)) throw new FileError(HttpStatus.BAD_REQUEST, invalidHeaderMessage)
    const parsed = Number(normalized)
    if (!Number.isSafeInteger(parsed)) throw new FileError(HttpStatus.BAD_REQUEST, invalidHeaderMessage)
    return parsed
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

  private async directoryForRequest(user: UserModel, space: SpaceEnv, uploadId: string): Promise<string> {
    this.assertUploadId(uploadId)
    this.assertDestination(space)
    const temporaryRoot = await existingTemporaryRootFromSpace(user, space)
    const directory = this.sessionDirectory(temporaryRoot, user.id, uploadId)
    if (!isPathInside(temporaryRoot, directory)) throw new HttpException('Upload session not found', HttpStatus.NOT_FOUND)
    return directory
  }

  private sessionDirectory(temporaryRoot: string, userId: number, uploadId: string): string {
    return path.join(temporaryRoot, fileUploadSessionDirectoryName(userId, uploadId))
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
    typeof value.destination === 'string' &&
    (value.method === HTTP_METHOD.POST || value.method === HTTP_METHOD.PUT) &&
    Number.isSafeInteger(value.expectedSize) &&
    (value.expectedSize as number) >= 0 &&
    (value.mtime === undefined || Number.isSafeInteger(value.mtime)) &&
    (value.checksumMode === undefined ||
      value.checksumMode === FILE_UPLOAD_SESSION_CHECKSUM_MODE.CHUNK_SUFFIX ||
      value.checksumMode === FILE_UPLOAD_SESSION_CHECKSUM_MODE.SYNC_RAW) &&
    (value.checksumMode !== FILE_UPLOAD_SESSION_CHECKSUM_MODE.CHUNK_SUFFIX || value.checksum !== undefined) &&
    (value.checksumMode !== FILE_UPLOAD_SESSION_CHECKSUM_MODE.SYNC_RAW || value.checksum === undefined) &&
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
