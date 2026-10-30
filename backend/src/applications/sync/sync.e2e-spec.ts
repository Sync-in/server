import type { ExecutionContext } from '@nestjs/common'
import { HttpStatus, StandardSchemaValidationPipe } from '@nestjs/common'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { gzipSync } from 'node:zlib'
import { AuthRateLimitGuard } from '../../authentication/guards/auth-rate-limit.guard.js'
import { SpaceGuard } from '../spaces/guards/space.guard.js'
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
const SYNC_USER = { id: 1, login: 'sync-e2e' }
const VALID_DIFF_BODY = {
  secureDiff: true,
  firstSync: false,
  defaultFilters: ['*.tmp'],
  pathFilters: null
}

describe('Sync (e2e)', () => {
  let app: NestFastifyApplication
  const syncManager = {
    diff: vi.fn<SyncManager['diff']>()
  }

  beforeAll(async () => {
    const authenticatedGuard = {
      canActivate(context: ExecutionContext): true {
        context.switchToHttp().getRequest().user = SYNC_USER
        return true
      }
    }
    const testingModuleBuilder = Test.createTestingModule({
      controllers: [SyncController],
      providers: [
        SyncDiffGzipBodyInterceptor,
        { provide: SyncManager, useValue: syncManager },
        { provide: SyncClientsManager, useValue: {} },
        { provide: SyncPathsManager, useValue: {} }
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

  afterAll(async () => app.close())

  beforeEach(() => {
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
})
