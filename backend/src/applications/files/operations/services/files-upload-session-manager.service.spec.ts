import { HttpException, HttpStatus } from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { configuration } from '../../../../configuration/config.environment.js'
import { HTTP_METHOD } from '../../../applications.constants.js'
import { SPACE_OPERATION } from '../../../spaces/constants/spaces.js'
import type { FastifySpaceRequest } from '../../../spaces/interfaces/space-request.interface.js'
import type { SpaceEnv } from '../../../spaces/models/space-env.model.js'
import { temporaryRootFromSpace } from '../../../spaces/utils/paths.js'
import type { UserModel } from '../../../users/models/user.model.js'
import { DEFAULT_MIME_TYPE } from '../../core/constants/files.js'
import { FileEvent } from '../../core/events/file-events.js'
import type { FilesManager } from '../../core/services/files-manager.service.js'
import { LockConflict } from '../../locks/models/file-lock-error.js'
import type { FilesLockManager } from '../../locks/services/files-lock-manager.service.js'
import {
  FILE_UPLOAD_SESSION,
  FILE_UPLOAD_SESSION_CHECKSUM_MODE,
  FILE_UPLOAD_SESSION_CHECKSUM_SIZE,
  FILE_UPLOAD_SESSION_HEADER,
  FILE_UPLOAD_SESSION_STATE
} from '../constants/upload-session.js'
import type {
  FileUploadSessionChunkHeaders,
  FileUploadSessionMetadataHeaders,
  FileUploadSessionMethod
} from '../interfaces/file-upload-session.interface.js'
import { FileUploadSessionOffsetError } from '../models/file-upload-session-offset-error.js'
import { fileUploadSessionDirectoryName, isFileUploadSessionDirectoryName } from '../utils/upload-session.js'
import { FilesUploadSessionManager } from './files-upload-session-manager.service.js'

describe(FilesUploadSessionManager.name, () => {
  const originalMaxChunkSize = configuration.applications.files.transfers.maxChunkSize
  const originalMaxUploadSize = configuration.applications.files.transfers.maxUploadSize
  const user = { id: 42, login: 'alice' } as unknown as UserModel
  const filesLockManager = {
    create: vi.fn(),
    removeLock: vi.fn()
  }
  const filesManager = {
    prepareUploadOverwriteDestination: vi.fn()
  }
  const manager = new FilesUploadSessionManager(filesLockManager as unknown as FilesLockManager, filesManager as unknown as FilesManager)

  let storageRoot: string
  let space: SpaceEnv

  beforeEach(async () => {
    vi.clearAllMocks()
    configuration.applications.files.transfers.maxChunkSize = 4
    configuration.applications.files.transfers.maxUploadSize = 100
    storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sync-in-upload-session-'))
    space = makeSpace('destination.bin')
    filesLockManager.create.mockResolvedValue([true, { key: 'upload-lock' }])
    filesLockManager.removeLock.mockResolvedValue(true)
    filesManager.prepareUploadOverwriteDestination.mockResolvedValue(undefined)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await fs.rm(storageRoot, { force: true, recursive: true })
  })

  afterAll(() => {
    configuration.applications.files.transfers.maxChunkSize = originalMaxChunkSize
    configuration.applications.files.transfers.maxUploadSize = originalMaxUploadSize
  })

  it('rejects creation when the file exceeds the upload ceiling', async () => {
    configuration.applications.files.transfers.maxUploadSize = 5
    await expect(createUpload(6, 'a')).rejects.toMatchObject({ status: HttpStatus.PAYLOAD_TOO_LARGE })
  })

  it('uses an actor-scoped flat directory name for upload sessions', () => {
    const uploadId = crypto.randomUUID()
    const directoryName = fileUploadSessionDirectoryName(user.id, uploadId)

    expect(directoryName).toBe(`server-user-${user.id}-upload-${uploadId}-session`)
    expect(isFileUploadSessionDirectoryName(directoryName)).toBe(true)
    expect(isFileUploadSessionDirectoryName(`server-user-0-upload-${uploadId}-session`)).toBe(false)
    expect(isFileUploadSessionDirectoryName(`server-user-042-upload-${uploadId}-session`)).toBe(false)
    expect(isFileUploadSessionDirectoryName(`desktop-${user.id}-upload-${uploadId}-session`)).toBe(false)
  })

  it('creates and continues a session when client chunking is disabled', async () => {
    configuration.applications.files.transfers.maxChunkSize = null
    const { uploadId } = await createUpload(6, 'ab')

    await expect(manager.status(user, space, uploadId)).resolves.toMatchObject({ offset: 2, state: FILE_UPLOAD_SESSION_STATE.UPLOADING })
    await expect(appendUpload(uploadId, 6, 2, 'cd')).resolves.toMatchObject({ offset: 4, state: FILE_UPLOAD_SESSION_STATE.UPLOADING })
  })

  it('orchestrates Sync chunk headers and response headers', async () => {
    const uploadId = crypto.randomUUID()
    const req = makeUploadRequest({ 'upload-checksum': 'a'.repeat(64), 'upload-mtime': '1' })
    const reply = makeReply()
    const createSpy = vi
      .spyOn(manager, 'create')
      .mockResolvedValue({ ino: 123, offset: 4, size: 4, state: FILE_UPLOAD_SESSION_STATE.COMPLETE, validatedOffset: 4 })

    await manager.writeUploadSessionChunk(req, uploadId, reply, HTTP_METHOD.PUT, true)

    expect(createSpy).toHaveBeenCalledWith(
      user,
      space,
      HTTP_METHOD.PUT,
      uploadId,
      req.raw,
      { contentLength: '4', contentType: DEFAULT_MIME_TYPE, uploadLength: '4', uploadOffset: '0' },
      { checksum: 'a'.repeat(64), mtime: '1' },
      true
    )
    expect(reply.header).toHaveBeenCalledWith(FILE_UPLOAD_SESSION_HEADER.INO, '123')
    expect(reply.header).toHaveBeenCalledWith(FILE_UPLOAD_SESSION_HEADER.VALIDATED_OFFSET, '4')
  })

  it('sets recovery headers when a chunk write fails', async () => {
    const req = makeUploadRequest()
    const offsetReply = makeReply()
    const offsetError = new FileUploadSessionOffsetError(2, 'Chunk body is incomplete', 1)
    vi.spyOn(manager, 'append').mockRejectedValueOnce(offsetError)

    await expect(manager.writeUploadSessionChunk(req, crypto.randomUUID(), offsetReply)).rejects.toBe(offsetError)
    expect(offsetReply.header).toHaveBeenCalledWith(FILE_UPLOAD_SESSION_HEADER.OFFSET, '2')
    expect(offsetReply.header).toHaveBeenCalledWith(FILE_UPLOAD_SESSION_HEADER.VALIDATED_OFFSET, '1')
    expect(offsetReply.header).toHaveBeenCalledWith('Connection', 'close')

    const lockedReply = makeReply()
    const lockedError = new HttpException('Upload session is busy', HttpStatus.LOCKED)
    vi.spyOn(manager, 'create').mockRejectedValueOnce(lockedError)

    await expect(manager.writeUploadSessionChunk(req, crypto.randomUUID(), lockedReply, HTTP_METHOD.POST)).rejects.toBe(lockedError)
    expect(lockedReply.header).toHaveBeenCalledWith('Retry-After', '2')
  })

  it('checks the full staged size against quota when overwriting', async () => {
    await fs.writeFile(space.realPath, 'existing')

    await createUpload(3, 'a', HTTP_METHOD.PUT)

    expect(space.willExceedQuota).toHaveBeenCalledWith(3)
  })

  it('requires modify permission to publish a PUT even when the destination is absent', async () => {
    space.envPermissions = SPACE_OPERATION.ADD

    await expect(createUpload(1, 'a', HTTP_METHOD.PUT)).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN })
    await expect(fs.stat(space.realPath)).rejects.toMatchObject({ code: 'ENOENT' })

    space.envPermissions = SPACE_OPERATION.MODIFY

    await expect(createUpload(1, 'a', HTTP_METHOD.PUT)).resolves.toMatchObject({ status: { state: FILE_UPLOAD_SESSION_STATE.COMPLETE } })
    await expect(fs.readFile(space.realPath, 'utf8')).resolves.toBe('a')
  })

  it('rechecks quota on every chunk', async () => {
    const { uploadId } = await createUpload(5, '12')
    vi.mocked(space.willExceedQuota).mockReturnValue(true)

    await expect(appendUpload(uploadId, 5, 2, '3')).rejects.toMatchObject({ status: HttpStatus.INSUFFICIENT_STORAGE })
    expect(space.willExceedQuota).toHaveBeenLastCalledWith(1)
  })

  it('publishes automatically on the last chunk and removes the session', async () => {
    const emitSpy = vi.spyOn(FileEvent, 'emit')
    const { uploadId, status } = await createUpload(6, 'abc')
    expect(status).toEqual({ offset: 3, size: 6, state: FILE_UPLOAD_SESSION_STATE.UPLOADING })

    const completion = await appendUpload(uploadId, 6, 3, 'def')
    const stats = await fs.stat(space.realPath)

    expect(await fs.readFile(space.realPath, 'utf8')).toBe('abcdef')
    expect(completion).toEqual({ ino: stats.ino, offset: 6, size: 6, state: FILE_UPLOAD_SESSION_STATE.COMPLETE })
    await expect(manager.status(user, space, uploadId)).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND })
    await expect(appendUpload(uploadId, 6, 6, '')).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND })
    expect(emitSpy).toHaveBeenCalledTimes(1)
  })

  it('rejects publication when the exclusive destination lock is already held', async () => {
    const existingLock = { key: 'existing-lock' }
    filesLockManager.create.mockResolvedValueOnce([false, existingLock])

    await expect(createUpload(1, 'a')).rejects.toMatchObject({ status: HttpStatus.LOCKED })

    await expect(fs.stat(space.realPath)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(filesLockManager.removeLock).not.toHaveBeenCalled()
  })

  it('publishes an empty file in its creation request', async () => {
    const { status } = await createUpload(0, '')

    expect(status).toMatchObject({ offset: 0, size: 0, state: FILE_UPLOAD_SESSION_STATE.COMPLETE })
    expect((await fs.stat(space.realPath)).size).toBe(0)
  })

  it('publishes an empty fast Sync file without requiring a checksum suffix', async () => {
    const status = await manager.create(user, space, HTTP_METHOD.POST, crypto.randomUUID(), Readable.from(''), chunkHeaders(0, 0, ''), {}, true)

    expect(status).toMatchObject({ offset: 0, size: 0, state: FILE_UPLOAD_SESSION_STATE.COMPLETE, validatedOffset: 0 })
    expect((await fs.stat(space.realPath)).size).toBe(0)
  })

  it('keeps the published file when cancellation follows completion', async () => {
    const { uploadId } = await createUpload(1, 'a')

    await manager.cancel(user, space, uploadId)

    await expect(manager.status(user, space, uploadId)).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND })
    await expect(fs.readFile(space.realPath, 'utf8')).resolves.toBe('a')
  })

  it('keeps a partially received first chunk as the resumable offset', async () => {
    const uploadId = crypto.randomUUID()

    await expect(
      manager.create(user, space, HTTP_METHOD.POST, uploadId, Readable.from('ab'), {
        ...chunkHeaders(6, 0, 'ab'),
        contentLength: '3'
      })
    ).rejects.toMatchObject({ offset: 2, status: HttpStatus.CONFLICT })
    await expect(manager.status(user, space, uploadId)).resolves.toMatchObject({ offset: 2 })
  })

  it('requires application/octet-stream for every chunk', async () => {
    const uploadId = crypto.randomUUID()

    await expect(
      manager.create(user, space, HTTP_METHOD.POST, uploadId, Readable.from('a'), { ...chunkHeaders(2, 0, 'a'), contentType: undefined })
    ).rejects.toMatchObject({ status: HttpStatus.UNSUPPORTED_MEDIA_TYPE })
    await expect(
      manager.create(user, space, HTTP_METHOD.POST, uploadId, Readable.from('a'), chunkHeaders(2, 0, 'a', 'text/plain'))
    ).rejects.toMatchObject({ status: HttpStatus.UNSUPPORTED_MEDIA_TYPE })
    await expect(
      manager.create(user, space, HTTP_METHOD.POST, uploadId, Readable.from('a'), chunkHeaders(2, 0, 'a', 'Application/Octet-Stream; charset=binary'))
    ).resolves.toMatchObject({ offset: 1 })
    expect(() => manager.append(user, space, uploadId, Readable.from('b'), chunkHeaders(2, 1, 'b', 'text/plain'))).toThrow(
      `Content-Type must be ${DEFAULT_MIME_TYPE}`
    )
    await expect(manager.status(user, space, uploadId)).resolves.toMatchObject({ offset: 1 })
  })

  it('rejects invalid offsets and a mismatched upload-length without writing', async () => {
    const { uploadId } = await createUpload(6, 'ab')

    expect(() => manager.append(user, space, uploadId, Readable.from('c'), { ...chunkHeaders(6, 0, 'c'), uploadOffset: undefined })).toThrow(
      'upload-offset header is required'
    )
    await expect(manager.append(user, space, uploadId, Readable.from('c'), chunkHeaders(7, 2, 'c'))).rejects.toMatchObject({
      status: HttpStatus.CONFLICT
    })
    await expect(manager.status(user, space, uploadId)).resolves.toMatchObject({ offset: 2 })
  })

  it('accepts chunks above the advertised client size and rejects chunks above the remaining size', async () => {
    const largerThanAdvertised = await createUpload(10, 'ab')
    await expect(appendUpload(largerThanAdvertised.uploadId, 10, 2, '12345')).resolves.toMatchObject({ offset: 7 })

    const exceeding = await createUpload(5, 'ab')
    await expect(appendUpload(exceeding.uploadId, 5, 2, '1234')).rejects.toMatchObject({ status: HttpStatus.PAYLOAD_TOO_LARGE })
  })

  it('does not reclaim an abandoned session lock', async () => {
    const { uploadId } = await createUpload(6, 'a')
    await fs.writeFile(path.join(sessionDirectory(uploadId), FILE_UPLOAD_SESSION.LOCK), crypto.randomUUID())

    await expect(appendUpload(uploadId, 6, 1, 'b')).rejects.toMatchObject({ status: HttpStatus.LOCKED })
  })

  it('rejects a concurrent write while a chunk owns the session lock', async () => {
    const { uploadId } = await createUpload(6, 'a')
    let releaseChunk!: () => void
    let chunkStarted!: () => void
    const chunkRelease = new Promise<void>((resolve) => {
      releaseChunk = resolve
    })
    const chunkStart = new Promise<void>((resolve) => {
      chunkStarted = resolve
    })
    const stream = Readable.from(
      (async function* () {
        chunkStarted()
        await chunkRelease
        yield 'b'
      })()
    )
    const firstAppend = manager.append(user, space, uploadId, stream, chunkHeaders(6, 1, 'b'))
    await chunkStart
    try {
      await expect(appendUpload(uploadId, 6, 1, 'b')).rejects.toMatchObject({ status: HttpStatus.LOCKED })
    } finally {
      releaseChunk()
    }
    await expect(firstAppend).resolves.toMatchObject({ offset: 2 })
  })

  it('removes the session when publication succeeds but the event emission fails', async () => {
    const emitSpy = vi.spyOn(FileEvent, 'emit').mockImplementationOnce(() => {
      throw new Error('Interrupted finalization')
    })
    const uploadId = crypto.randomUUID()

    await expect(createUpload(4, 'data', HTTP_METHOD.POST, {}, uploadId)).rejects.toThrow('Interrupted finalization')
    await expect(fs.readFile(space.realPath, 'utf8')).resolves.toBe('data')
    await expect(manager.status(user, space, uploadId)).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND })
    await expect(appendUpload(uploadId, 4, 4, '')).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND })
    expect(emitSpy).toHaveBeenCalledTimes(1)
  })

  it('removes the session when post-move metadata finalization fails', async () => {
    const uploadId = crypto.randomUUID()
    const realUtimes = fs.utimes
    vi.spyOn(fs, 'utimes').mockImplementation((filePath, atime, mtime) => {
      if (filePath === space.realPath) return Promise.reject(new Error('Interrupted metadata finalization'))
      return realUtimes(filePath, atime, mtime)
    })

    await expect(createUpload(4, 'data', HTTP_METHOD.POST, { mtime: 1 }, uploadId)).rejects.toThrow('Interrupted metadata finalization')
    await expect(fs.readFile(space.realPath, 'utf8')).resolves.toBe('data')
    await expect(manager.status(user, space, uploadId)).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND })
  })

  it('validates a suffixed Sync chunk, applies mtime and returns the published inode', async () => {
    const content = 'sync'
    const mtime = 1_700_000_000
    const checksum = crypto.createHash('sha512-256').update(content).digest('hex')

    const { status } = await createSyncUpload(content.length, content, HTTP_METHOD.PUT, { checksum, mtime })
    const stats = await fs.stat(space.realPath)

    expect(status.ino).toBe(stats.ino)
    expect(status.validatedOffset).toBe(content.length)
    expect(Math.floor(stats.mtimeMs / 1000)).toBe(mtime)
    expect(filesManager.prepareUploadOverwriteDestination).toHaveBeenCalledWith(user, space)
  })

  it('streams a fast Sync chunk without checksum state and accepts signed mtime metadata', async () => {
    const uploadId = crypto.randomUUID()

    await expect(createSyncUpload(2, 'a', HTTP_METHOD.PUT, { mtime: -1 }, uploadId)).resolves.toMatchObject({
      status: { offset: 1, state: FILE_UPLOAD_SESSION_STATE.UPLOADING, validatedOffset: 1 }
    })
    await expect(manager.status(user, space, uploadId)).resolves.toMatchObject({ offset: 1, validatedOffset: 1 })
    await expect(fs.readFile(path.join(sessionDirectory(uploadId), FILE_UPLOAD_SESSION.MANIFEST), 'utf8')).resolves.toContain(
      `"checksumMode":"${FILE_UPLOAD_SESSION_CHECKSUM_MODE.SYNC_RAW}"`
    )
    await expect(fs.readFile(path.join(sessionDirectory(uploadId), FILE_UPLOAD_SESSION.MANIFEST), 'utf8')).resolves.toContain('"mtime":-1')
    await expect(fs.stat(path.join(sessionDirectory(uploadId), FILE_UPLOAD_SESSION.STATE))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(fs.readFile(path.join(sessionDirectory(uploadId), FILE_UPLOAD_SESSION.PAYLOAD), 'utf8')).resolves.toBe('a')
  })

  it('keeps the fast Sync transport mode immutable and distinct from web sessions', async () => {
    const uploadId = crypto.randomUUID()
    await createSyncUpload(2, 'a', HTTP_METHOD.POST, {}, uploadId)

    await expect(manager.append(user, space, uploadId, Readable.from('b'), chunkHeaders(2, 1, 'b'))).rejects.toMatchObject({
      status: HttpStatus.CONFLICT
    })
    const checksum = crypto.createHash('sha512-256').update('ab').digest('hex')
    await expect(
      manager.create(
        user,
        space,
        HTTP_METHOD.POST,
        uploadId,
        Readable.from(checksummedBody('a')),
        checksummedChunkHeaders(2, 0, 1),
        { checksum },
        true
      )
    ).rejects.toMatchObject({ status: HttpStatus.CONFLICT })
    await expect(manager.append(user, space, uploadId, Readable.from('b'), chunkHeaders(2, 1, 'b'), true)).resolves.toMatchObject({
      state: FILE_UPLOAD_SESSION_STATE.COMPLETE,
      validatedOffset: 2
    })
    await expect(fs.readFile(space.realPath, 'utf8')).resolves.toBe('ab')
  })

  it('resumes an incomplete fast Sync chunk directly from its staged offset', async () => {
    const uploadId = crypto.randomUUID()

    await expect(
      manager.create(user, space, HTTP_METHOD.POST, uploadId, Readable.from('ab'), { ...chunkHeaders(6, 0, 'ab'), contentLength: '3' }, {}, true)
    ).rejects.toMatchObject({ offset: 2, status: HttpStatus.CONFLICT, validatedOffset: 2 })
    await expect(manager.status(user, space, uploadId)).resolves.toMatchObject({ offset: 2, validatedOffset: 2 })
    await expect(manager.append(user, space, uploadId, Readable.from('cdef'), chunkHeaders(6, 2, 'cdef'), true)).resolves.toMatchObject({
      state: FILE_UPLOAD_SESSION_STATE.COMPLETE,
      validatedOffset: 6
    })
    await expect(fs.readFile(space.realPath, 'utf8')).resolves.toBe('abcdef')
  })

  it('truncates the unvalidated Sync range when its suffixed checksum differs', async () => {
    const uploadId = crypto.randomUUID()
    const body = Buffer.concat([Buffer.from('sync'), Buffer.alloc(FILE_UPLOAD_SESSION_CHECKSUM_SIZE)])

    await expect(
      manager.create(
        user,
        space,
        HTTP_METHOD.PUT,
        uploadId,
        Readable.from(body),
        checksummedChunkHeaders(4, 0, 4),
        { checksum: '0'.repeat(64) },
        true
      )
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST })
    await expect(manager.status(user, space, uploadId)).resolves.toMatchObject({
      offset: 0,
      state: FILE_UPLOAD_SESSION_STATE.UPLOADING,
      validatedOffset: 0
    })
  })

  it('rehashes only the retained incomplete Sync range before validating its continuation', async () => {
    const uploadId = crypto.randomUUID()
    const checksum = crypto.createHash('sha512-256').update('abcdef').digest('hex')

    await expect(
      manager.create(user, space, HTTP_METHOD.POST, uploadId, Readable.from('abc'), checksummedChunkHeaders(6, 0, 6), { checksum }, true)
    ).rejects.toMatchObject({ offset: 3, status: HttpStatus.CONFLICT, validatedOffset: 0 })
    await expect(manager.status(user, space, uploadId)).resolves.toMatchObject({
      offset: 3,
      state: FILE_UPLOAD_SESSION_STATE.UPLOADING,
      validatedOffset: 0
    })

    const completion = await manager.append(
      user,
      space,
      uploadId,
      Readable.from(checksummedBody('def', 'abcdef')),
      checksummedChunkHeaders(6, 3, 3),
      true
    )

    expect(completion).toMatchObject({ offset: 6, state: FILE_UPLOAD_SESSION_STATE.COMPLETE, validatedOffset: 6 })
    await expect(fs.readFile(space.realPath, 'utf8')).resolves.toBe('abcdef')
  })

  it('accepts a checksum-only retry when every payload byte was received before interruption', async () => {
    const uploadId = crypto.randomUUID()
    const checksum = crypto.createHash('sha512-256').update('sync').digest('hex')

    await expect(
      manager.create(user, space, HTTP_METHOD.POST, uploadId, Readable.from('sync'), checksummedChunkHeaders(4, 0, 4), { checksum }, true)
    ).rejects.toMatchObject({ offset: 4, status: HttpStatus.CONFLICT, validatedOffset: 0 })
    await expect(manager.status(user, space, uploadId)).resolves.toMatchObject({
      offset: 4,
      state: FILE_UPLOAD_SESSION_STATE.UPLOADING,
      validatedOffset: 0
    })

    await expect(
      manager.append(user, space, uploadId, Readable.from(checksummedBody('', 'sync')), checksummedChunkHeaders(4, 4, 0), true)
    ).resolves.toMatchObject({ offset: 4, state: FILE_UPLOAD_SESSION_STATE.COMPLETE, validatedOffset: 4 })
  })

  it('does not expose a session through another destination', async () => {
    const { uploadId } = await createUpload(6, 'a')

    await expect(
      manager.create(user, makeSpace('other.bin'), HTTP_METHOD.POST, uploadId, Readable.from('a'), chunkHeaders(6, 0, 'a'))
    ).rejects.toMatchObject({ status: HttpStatus.CONFLICT })
  })

  it('rejects symbolic links and non-immediate file ancestors', async () => {
    const actualDirectory = path.join(storageRoot, 'actual')
    await fs.mkdir(actualDirectory)
    await fs.symlink(actualDirectory, path.join(storageRoot, 'linked'))

    await expect(createUpload(2, 'a', HTTP_METHOD.POST, {}, crypto.randomUUID(), makeSpace('linked/file.bin'))).rejects.toMatchObject({
      status: HttpStatus.CONFLICT
    })

    await fs.writeFile(path.join(storageRoot, 'ancestor'), 'existing ancestor file')
    await expect(createUpload(2, 'a', HTTP_METHOD.PUT, {}, crypto.randomUUID(), makeSpace('ancestor/parent/file.bin'))).rejects.toMatchObject({
      status: HttpStatus.CONFLICT
    })
  })

  it('retries publication with an empty PATCH after a destination lock conflict', async () => {
    const { uploadId } = await createUpload(6, 'ab', HTTP_METHOD.PUT)
    filesManager.prepareUploadOverwriteDestination.mockRejectedValueOnce(new LockConflict({} as any, 'Conflicting parent lock'))

    await expect(appendUpload(uploadId, 6, 2, 'cdef')).rejects.toMatchObject({ status: HttpStatus.LOCKED })
    await expect(manager.status(user, space, uploadId)).resolves.toMatchObject({ offset: 6, state: FILE_UPLOAD_SESSION_STATE.READY })
    await expect(appendUpload(uploadId, 6, 6, '')).resolves.toMatchObject({ state: FILE_UPLOAD_SESSION_STATE.COMPLETE })
  })

  it('retries publication of a fast Sync payload with an empty PATCH', async () => {
    filesLockManager.create.mockResolvedValueOnce([false, { key: 'existing-lock' }])
    const uploadId = crypto.randomUUID()

    await expect(createSyncUpload(4, 'sync', HTTP_METHOD.PUT, {}, uploadId)).rejects.toMatchObject({ status: HttpStatus.LOCKED })
    await expect(manager.status(user, space, uploadId)).resolves.toMatchObject({
      offset: 4,
      state: FILE_UPLOAD_SESSION_STATE.READY,
      validatedOffset: 4
    })
    await expect(manager.append(user, space, uploadId, Readable.from(''), chunkHeaders(4, 4, ''), true)).resolves.toMatchObject({
      state: FILE_UPLOAD_SESSION_STATE.COMPLETE,
      validatedOffset: 4
    })
  })

  async function createUpload(
    size: number,
    content: string,
    method: FileUploadSessionMethod = HTTP_METHOD.POST,
    metadata: FileUploadSessionMetadataHeaders = {},
    uploadId = crypto.randomUUID(),
    uploadSpace = space
  ) {
    const status = await manager.create(user, uploadSpace, method, uploadId, Readable.from(content), chunkHeaders(size, 0, content), metadata)
    return { status, uploadId }
  }

  async function createSyncUpload(
    size: number,
    content: string,
    method: FileUploadSessionMethod = HTTP_METHOD.POST,
    metadata: FileUploadSessionMetadataHeaders = {},
    uploadId = crypto.randomUUID(),
    uploadSpace = space
  ) {
    const body = metadata.checksum ? checksummedBody(content) : Buffer.from(content)
    const status = await manager.create(
      user,
      uploadSpace,
      method,
      uploadId,
      metadata.checksum ? Readable.from([body.subarray(0, body.length - 10), body.subarray(body.length - 10)]) : Readable.from(body),
      metadata.checksum ? checksummedChunkHeaders(size, 0, Buffer.byteLength(content)) : chunkHeaders(size, 0, content),
      metadata,
      true
    )
    return { status, uploadId }
  }

  function appendUpload(uploadId: string, size: number, offset: number, content: string) {
    return manager.append(user, space, uploadId, Readable.from(content), chunkHeaders(size, offset, content))
  }

  function chunkHeaders(size: number, offset: number, content: string, contentType: unknown = DEFAULT_MIME_TYPE): FileUploadSessionChunkHeaders {
    return {
      contentLength: String(Buffer.byteLength(content)),
      contentType,
      uploadLength: String(size),
      uploadOffset: String(offset)
    }
  }

  function checksummedBody(content: string, checksumContent = content): Buffer {
    return Buffer.concat([Buffer.from(content), crypto.createHash('sha512-256').update(checksumContent).digest()])
  }

  function checksummedChunkHeaders(size: number, offset: number, payloadLength: number): FileUploadSessionChunkHeaders {
    return {
      contentLength: String(payloadLength + FILE_UPLOAD_SESSION_CHECKSUM_SIZE),
      contentType: DEFAULT_MIME_TYPE,
      uploadLength: String(size),
      uploadOffset: String(offset)
    }
  }

  function makeUploadRequest(headers: Record<string, string> = {}): FastifySpaceRequest {
    return {
      headers: {
        'content-length': '4',
        'content-type': DEFAULT_MIME_TYPE,
        'upload-length': '4',
        'upload-offset': '0',
        ...headers
      },
      raw: { httpVersionMajor: 1 },
      space,
      user
    } as unknown as FastifySpaceRequest
  }

  function makeReply(): FastifyReply {
    return { header: vi.fn().mockReturnThis() } as unknown as FastifyReply
  }

  function sessionDirectory(uploadId: string): string {
    return path.join(temporaryRootFromSpace(user, space), fileUploadSessionDirectoryName(user.id, uploadId))
  }

  function makeSpace(fileName: string): SpaceEnv {
    return {
      dbFile: { path: fileName },
      envPermissions: 'a:m',
      id: 1,
      alias: 'external',
      inFilesRepository: true,
      inPersonalSpace: false,
      inSharesList: false,
      inSharesRepository: false,
      inTrashRepository: false,
      realBasePath: storageRoot,
      realPath: path.join(storageRoot, fileName),
      root: { externalPath: storageRoot },
      url: `files/external/${fileName}`,
      willExceedQuota: vi.fn().mockReturnValue(false)
    } as unknown as SpaceEnv
  }
})
