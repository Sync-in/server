import type { ExecutionContext } from '@nestjs/common'
import { HttpStatus, StandardSchemaValidationPipe } from '@nestjs/common'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { AuthRateLimitGuard } from '../../authentication/guards/auth-rate-limit.guard.js'
import { FilesManager } from '../files/core/services/files-manager.service.js'
import { FilesLockManager } from '../files/locks/services/files-lock-manager.service.js'
import { FilesUploadSessionManager } from '../files/operations/services/files-upload-session-manager.service.js'
import { SpaceGuard } from '../spaces/guards/space.guard.js'
import type { SpaceEnv } from '../spaces/models/space-env.model.js'
import { UserPermissionsGuard } from '../users/guards/permissions.guard.js'
import { SYNC_ROUTE } from './constants/routes.js'
import { CHECK_SERVER_RESP, SYNC_IN_SERVER_AGENT } from './constants/sync.js'
import { SyncDiffGzipBodyInterceptor } from './interceptors/sync-diff-gzip-body.interceptor.js'
import { SyncClientsManager } from './services/sync-clients-manager.service.js'
import { SyncManager } from './services/sync-manager.service.js'
import { SyncPathsManager } from './services/sync-paths-manager.service.js'
import { SyncController } from './sync.controller.js'

const DIFF_PATH_ID = 42
const DIFF_URL = `${SYNC_ROUTE.BASE}/${SYNC_ROUTE.OPERATION}/${SYNC_ROUTE.DIFF}/${DIFF_PATH_ID}`
const UPLOAD_DESTINATION = 'files/personal/upload-session-e2e.bin'
const SYNC_USER = { id: 1, login: 'sync-e2e' }
const VALID_DIFF_BODY = {
  secureDiff: true,
  firstSync: false,
  defaultFilters: ['*.tmp'],
  pathFilters: null
}

describe('Sync (e2e)', () => {
  let app: NestFastifyApplication
  let space: SpaceEnv
  let storageRoot: string
  const syncManager = {
    diff: vi.fn<SyncManager['diff']>()
  }
  const filesLockManager = {
    create: vi.fn().mockResolvedValue([true, { key: 'upload-lock' }]),
    removeLock: vi.fn().mockResolvedValue(true)
  }
  const filesManager = {
    prepareUploadOverwriteDestination: vi.fn().mockResolvedValue(undefined)
  }

  beforeAll(async () => {
    storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sync-in-sync-upload-session-e2e-'))
    space = makeSpace(storageRoot)
    const authenticatedGuard = {
      canActivate(context: ExecutionContext): true {
        const request = context.switchToHttp().getRequest()
        request.user = SYNC_USER
        request.space = space
        return true
      }
    }
    const testingModuleBuilder = Test.createTestingModule({
      controllers: [SyncController],
      providers: [
        SyncDiffGzipBodyInterceptor,
        { provide: SyncManager, useValue: syncManager },
        { provide: SyncClientsManager, useValue: {} },
        { provide: SyncPathsManager, useValue: {} },
        FilesUploadSessionManager,
        { provide: FilesLockManager, useValue: filesLockManager },
        { provide: FilesManager, useValue: filesManager }
      ]
    })
    testingModuleBuilder.overrideGuard(AuthRateLimitGuard).useValue({ canActivate: () => true })
    testingModuleBuilder.overrideGuard(UserPermissionsGuard).useValue(authenticatedGuard)
    testingModuleBuilder.overrideGuard(SpaceGuard).useValue(authenticatedGuard)
    const module: TestingModule = await testingModuleBuilder.compile()
    module.useLogger(['fatal'])

    const adapter = new FastifyAdapter()
    app = module.createNestApplication<NestFastifyApplication>(adapter)
    adapter.getInstance().addContentTypeParser('*', (_request, _payload, done) => done(null))
    app.useGlobalPipes(new StandardSchemaValidationPipe())
    await app.init()
    await adapter.getInstance().ready()
  })

  afterAll(async () => {
    try {
      await app.close()
    } finally {
      await fs.rm(storageRoot, { force: true, recursive: true })
    }
  })

  beforeEach(() => {
    vi.clearAllMocks()
    syncManager.diff.mockReset().mockResolvedValue(undefined)
  })

  it('GET handshake should identify the Sync server', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `${SYNC_ROUTE.BASE}/${SYNC_ROUTE.HANDSHAKE}`,
      headers: { 'user-agent': `${SYNC_IN_SERVER_AGENT}/e2e` }
    })

    expect(response.statusCode).toBe(HttpStatus.OK)
    expect(response.json()).toEqual(CHECK_SERVER_RESP)
  })

  it('GET handshake should reject an unknown client', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `${SYNC_ROUTE.BASE}/${SYNC_ROUTE.HANDSHAKE}`,
      headers: { 'user-agent': 'unknown-client' }
    })

    expect(response.statusCode).toBe(HttpStatus.NOT_FOUND)
    expect(response.json()).toEqual({
      statusCode: HttpStatus.NOT_FOUND,
      message: 'Server not found'
    })
  })

  it('POST diff should pass a regular JSON body through the interceptor', async () => {
    const response = await app.inject({
      method: 'POST',
      url: DIFF_URL,
      headers: { 'content-type': 'application/json' },
      body: VALID_DIFF_BODY
    })

    expect(response.statusCode).toBe(HttpStatus.CREATED)
    expect(syncManager.diff).toHaveBeenCalledOnce()
    expect(syncManager.diff).toHaveBeenCalledWith(
      SYNC_USER,
      DIFF_PATH_ID,
      {
        ...VALID_DIFF_BODY,
        defaultFilters: new Set(VALID_DIFF_BODY.defaultFilters)
      },
      expect.anything()
    )
  })

  it('POST diff should gunzip, parse and validate a compressed JSON body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: DIFF_URL,
      headers: {
        'content-encoding': 'gzip',
        'content-type': 'application/octet-stream'
      },
      body: gzipSync(Buffer.from(JSON.stringify(VALID_DIFF_BODY)))
    })

    expect(response.statusCode).toBe(HttpStatus.CREATED)
    expect(syncManager.diff).toHaveBeenCalledOnce()
    expect(syncManager.diff).toHaveBeenCalledWith(
      SYNC_USER,
      DIFF_PATH_ID,
      {
        ...VALID_DIFF_BODY,
        defaultFilters: new Set(VALID_DIFF_BODY.defaultFilters)
      },
      expect.anything()
    )
  })

  it('POST diff should reject a body that is not valid gzip', async () => {
    const response = await app.inject({
      method: 'POST',
      url: DIFF_URL,
      headers: {
        'content-encoding': 'gzip',
        'content-type': 'application/octet-stream'
      },
      body: Buffer.from('not-gzip')
    })

    expect(response.statusCode).toBe(HttpStatus.BAD_REQUEST)
    expect(response.json()).toEqual({
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'Invalid gzip body'
    })
    expect(syncManager.diff).not.toHaveBeenCalled()
  })

  it('POST diff should reject invalid JSON after decompression', async () => {
    const response = await app.inject({
      method: 'POST',
      url: DIFF_URL,
      headers: {
        'content-encoding': 'gzip',
        'content-type': 'application/octet-stream'
      },
      body: gzipSync(Buffer.from('not-json'))
    })

    expect(response.statusCode).toBe(HttpStatus.BAD_REQUEST)
    expect(response.json()).toEqual({
      statusCode: HttpStatus.BAD_REQUEST,
      message: expect.stringMatching(/^Invalid JSON :/)
    })
    expect(syncManager.diff).not.toHaveBeenCalled()
  })

  it('POST diff should validate the decompressed body before calling the manager', async () => {
    const response = await app.inject({
      method: 'POST',
      url: DIFF_URL,
      headers: {
        'content-encoding': 'gzip',
        'content-type': 'application/octet-stream'
      },
      body: gzipSync(Buffer.from('{}'))
    })

    expect(response.statusCode).toBe(HttpStatus.BAD_REQUEST)
    expect(syncManager.diff).not.toHaveBeenCalled()
  })

  it('uploads and publishes a checksummed file through the Sync upload-session routes', async () => {
    const uploadId = crypto.randomUUID()
    const sessionUrl = `${SYNC_ROUTE.BASE}/${SYNC_ROUTE.UPLOAD_SESSION}/${uploadId}/${UPLOAD_DESTINATION}`
    const content = Buffer.from('abcdef')
    const firstPayload = checksummedPayload(content.subarray(0, 3))

    const firstChunk = await app.inject({
      method: 'POST',
      url: sessionUrl,
      headers: {
        'content-length': String(firstPayload.length),
        'content-type': 'application/octet-stream',
        'upload-checksum': crypto.createHash('sha512-256').update(content).digest('hex'),
        'upload-length': String(content.length),
        'upload-offset': '0'
      },
      payload: firstPayload
    })
    expect(firstChunk.statusCode).toBe(HttpStatus.CREATED)
    expect(firstChunk.headers['upload-offset']).toBe('3')
    expect(firstChunk.headers['upload-validated-offset']).toBe('3')
    expect(firstChunk.headers['upload-state']).toBe('uploading')

    const uploading = await app.inject({ method: 'HEAD', url: sessionUrl })
    expect(uploading.statusCode).toBe(HttpStatus.NO_CONTENT)
    expect(uploading.headers['upload-offset']).toBe('3')
    expect(uploading.headers['upload-validated-offset']).toBe('3')
    expect(uploading.headers['upload-state']).toBe('uploading')

    const lastPayload = checksummedPayload(content.subarray(3))
    const lastChunk = await app.inject({
      method: 'PATCH',
      url: sessionUrl,
      headers: {
        'content-length': String(lastPayload.length),
        'content-type': 'application/octet-stream',
        'upload-length': String(content.length),
        'upload-offset': '3'
      },
      payload: lastPayload
    })
    expect(lastChunk.statusCode).toBe(HttpStatus.NO_CONTENT)
    expect(lastChunk.headers['upload-offset']).toBe('6')
    expect(lastChunk.headers['upload-validated-offset']).toBe('6')
    expect(lastChunk.headers['upload-state']).toBe('complete')

    const published = await fs.stat(space.realPath)
    expect(lastChunk.headers['upload-ino']).toBe(String(published.ino))
    await expect(fs.readFile(space.realPath)).resolves.toEqual(content)

    const completed = await app.inject({ method: 'HEAD', url: sessionUrl })
    expect(completed.statusCode).toBe(HttpStatus.NOT_FOUND)
    expect(filesLockManager.create).toHaveBeenCalledOnce()
    expect(filesLockManager.removeLock).toHaveBeenCalledOnce()
  })

  function checksummedPayload(content: Buffer): Buffer {
    return Buffer.concat([content, crypto.createHash('sha512-256').update(content).digest()])
  }

  function makeSpace(root: string): SpaceEnv {
    return {
      dbFile: { path: 'upload-session-e2e.bin' },
      envPermissions: 'a:m',
      id: 1,
      alias: 'external',
      inFilesRepository: true,
      inPersonalSpace: false,
      inSharesList: false,
      inSharesRepository: false,
      inTrashRepository: false,
      realBasePath: root,
      realPath: path.join(root, 'upload-session-e2e.bin'),
      root: { externalPath: root },
      url: UPLOAD_DESTINATION,
      willExceedQuota: vi.fn().mockReturnValue(false)
    } as unknown as SpaceEnv
  }
})
