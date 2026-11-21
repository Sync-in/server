import type { ExecutionContext } from '@nestjs/common'
import { HttpStatus, StandardSchemaValidationPipe } from '@nestjs/common'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test, type TestingModule } from '@nestjs/testing'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configuration } from '../../../configuration/config.environment.js'
import { API_FILES_OPERATION_UPLOAD_SESSION } from '../core/constants/routes.js'
import { FilesManager } from '../core/services/files-manager.service.js'
import { FilesLockManager } from '../locks/services/files-lock-manager.service.js'
import { SpaceGuard } from '../../spaces/guards/space.guard.js'
import type { SpaceEnv } from '../../spaces/models/space-env.model.js'
import { FilesOperationsController } from './files-operations.controller.js'
import { FilesMethods } from './services/files-methods.service.js'
import { FilesUploadSessionManager } from './services/files-upload-session-manager.service.js'
import { FilesTasksManager } from '../tasks/services/files-tasks-manager.service.js'

const DESTINATION = 'files/personal/upload-session-e2e.bin'
const USER = { id: 1, login: 'upload-session-e2e' }

describe('File upload sessions (e2e)', () => {
  const originalMaxChunkSize = configuration.applications.files.transfers.maxChunkSize
  const originalMaxUploadSize = configuration.applications.files.transfers.maxUploadSize
  const filesLockManager = {
    createOrRefresh: vi.fn().mockResolvedValue([true, { key: 'upload-lock' }]),
    removeLock: vi.fn().mockResolvedValue(true)
  }
  const filesManager = {
    prepareUploadOverwriteDestination: vi.fn().mockResolvedValue(undefined)
  }

  let app: NestFastifyApplication
  let space: SpaceEnv
  let storageRoot: string

  beforeAll(async () => {
    configuration.applications.files.transfers.maxChunkSize = 4
    configuration.applications.files.transfers.maxUploadSize = 100
    storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sync-in-upload-session-e2e-'))
    space = makeSpace(storageRoot)
    const requestContext = {
      canActivate(context: ExecutionContext): true {
        const request = context.switchToHttp().getRequest()
        request.user = USER
        request.space = space
        return true
      }
    }
    const testingModuleBuilder = Test.createTestingModule({
      controllers: [FilesOperationsController],
      providers: [
        { provide: FilesMethods, useValue: {} },
        FilesUploadSessionManager,
        { provide: FilesLockManager, useValue: filesLockManager },
        { provide: FilesManager, useValue: filesManager },
        { provide: FilesTasksManager, useValue: {} }
      ]
    })
    testingModuleBuilder.overrideGuard(SpaceGuard).useValue(requestContext)
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
      configuration.applications.files.transfers.maxChunkSize = originalMaxChunkSize
      configuration.applications.files.transfers.maxUploadSize = originalMaxUploadSize
      await fs.rm(storageRoot, { force: true, recursive: true })
    }
  })

  beforeEach(() => {
    vi.clearAllMocks()
    filesLockManager.createOrRefresh.mockResolvedValue([true, { key: 'upload-lock' }])
    filesLockManager.removeLock.mockResolvedValue(true)
    filesManager.prepareUploadOverwriteDestination.mockResolvedValue(undefined)
  })

  afterEach(() => vi.restoreAllMocks())

  it('creates with the first chunk and publishes with the last chunk', async () => {
    const uploadId = crypto.randomUUID()
    const sessionUrl = `${API_FILES_OPERATION_UPLOAD_SESSION}/${uploadId}/${DESTINATION}`

    const firstChunk = await app.inject({
      method: 'POST',
      url: sessionUrl,
      headers: {
        'content-length': '3',
        'content-type': 'application/octet-stream',
        'upload-length': '6',
        'upload-offset': '0'
      },
      payload: Buffer.from('abc')
    })
    expect(firstChunk.statusCode).toBe(HttpStatus.CREATED)
    expect(firstChunk.headers['upload-length']).toBe('6')
    expect(firstChunk.headers['upload-offset']).toBe('3')
    expect(firstChunk.headers['upload-state']).toBe('uploading')

    const uploading = await app.inject({ method: 'HEAD', url: sessionUrl })
    expect(uploading.statusCode).toBe(HttpStatus.NO_CONTENT)
    expect(uploading.headers['upload-offset']).toBe('3')
    expect(uploading.headers['upload-state']).toBe('uploading')

    const lastChunk = await app.inject({
      method: 'PATCH',
      url: sessionUrl,
      headers: {
        'content-length': '3',
        'content-type': 'application/octet-stream',
        'upload-length': '6',
        'upload-offset': '3'
      },
      payload: Buffer.from('def')
    })
    expect(lastChunk.statusCode).toBe(HttpStatus.NO_CONTENT)
    expect(lastChunk.headers['upload-offset']).toBe('6')
    expect(lastChunk.headers['upload-state']).toBe('complete')

    const completed = await app.inject({ method: 'HEAD', url: sessionUrl })
    expect(completed.statusCode).toBe(HttpStatus.NOT_FOUND)
    await expect(fs.readFile(space.realPath, 'utf8')).resolves.toBe('abcdef')
    expect(filesLockManager.createOrRefresh).toHaveBeenCalledOnce()
    expect(filesLockManager.removeLock).toHaveBeenCalledOnce()
  })

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
      url: DESTINATION,
      willExceedQuota: vi.fn().mockReturnValue(false)
    } as unknown as SpaceEnv
  }
})
