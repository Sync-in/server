import { Reflector } from '@nestjs/core'
import { Test, TestingModule } from '@nestjs/testing'
import type { FastifyReply } from 'fastify'
import crypto from 'node:crypto'
import { AuthRateLimitGuard } from '../../authentication/guards/auth-rate-limit.guard.js'
import { HTTP_METHOD } from '../applications.constants.js'
import { FilesUploadSessionManager } from '../files/operations/services/files-upload-session-manager.service.js'
import { SPACE_OPERATION } from '../spaces/constants/spaces.js'
import { OverrideSpacePermission } from '../spaces/decorators/space-override-permission.decorator.js'
import type { FastifySpaceRequest } from '../spaces/interfaces/space-request.interface.js'
import { SpacesManager } from '../spaces/services/spaces-manager.service.js'
import { SyncClientsManager } from './services/sync-clients-manager.service.js'
import { SyncManager } from './services/sync-manager.service.js'
import { SyncPathsManager } from './services/sync-paths-manager.service.js'
import { SyncController } from './sync.controller.js'

describe(SyncController.name, () => {
  let controller: SyncController
  const uploadSessions = {
    cancelUploadSession: vi.fn().mockResolvedValue(undefined),
    writeUploadSessionChunk: vi.fn().mockResolvedValue(undefined),
    writeUploadSessionStatus: vi.fn().mockResolvedValue(undefined)
  }
  const req = {
    headers: {
      'content-length': '4',
      'content-type': 'application/octet-stream',
      'upload-checksum': 'a'.repeat(64),
      'upload-length': '4',
      'upload-mtime': '1',
      'upload-offset': '0'
    },
    raw: { httpVersionMajor: 1 },
    space: {},
    user: {}
  } as unknown as FastifySpaceRequest

  beforeAll(async () => {
    const testingModuleBuilder = Test.createTestingModule({
      controllers: [SyncController],
      providers: [
        { provide: SpacesManager, useValue: {} },
        { provide: SyncManager, useValue: {} },
        { provide: SyncClientsManager, useValue: {} },
        { provide: SyncPathsManager, useValue: {} },
        { provide: FilesUploadSessionManager, useValue: uploadSessions }
      ]
    })
    testingModuleBuilder.overrideGuard(AuthRateLimitGuard).useValue({ canActivate: () => true })
    const module: TestingModule = await testingModuleBuilder.compile()

    controller = module.get<SyncController>(SyncController)
  })

  beforeEach(() => vi.clearAllMocks())

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })

  it('requires modify permission for PUT upload sessions', () => {
    const reflector = new Reflector()

    expect(reflector.get(OverrideSpacePermission, SyncController.prototype.overwriteUploadSession)).toBe(SPACE_OPERATION.MODIFY)
  })

  it('creates a Sync overwrite session with its first chunk', async () => {
    const uploadId = crypto.randomUUID()
    const reply = { header: vi.fn().mockReturnThis() } as unknown as FastifyReply

    await expect(controller.overwriteUploadSession(req, uploadId, reply)).resolves.toBeUndefined()
    expect(uploadSessions.writeUploadSessionChunk).toHaveBeenCalledWith(req, uploadId, reply, HTTP_METHOD.PUT, true)
  })

  it('appends a Sync upload-session chunk', async () => {
    const reply = { header: vi.fn().mockReturnThis() } as unknown as FastifyReply
    const appendReq = { ...req, headers: { ...req.headers, 'upload-length': '8' } } as unknown as FastifySpaceRequest
    const uploadId = crypto.randomUUID()

    await expect(controller.appendUploadSession(appendReq, uploadId, reply)).resolves.toBeUndefined()
    expect(uploadSessions.writeUploadSessionChunk).toHaveBeenCalledWith(appendReq, uploadId, reply, undefined, true)
  })
})
