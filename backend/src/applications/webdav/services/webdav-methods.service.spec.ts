/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpException, HttpStatus } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { FileLock } from '../../files/interfaces/file-lock.interface'
import { FileError } from '../../files/models/file-error'
import { LockConflict } from '../../files/models/file-lock-error'
import { FilesLockManager } from '../../files/services/files-lock-manager.service'
import { FilesManager } from '../../files/services/files-manager.service'
import { dirName, genEtag, isPathExists } from '../../files/utils/files'
import { SPACE_REPOSITORY } from '../../spaces/constants/spaces'
import * as PathsUtils from '../../spaces/utils/paths'
import { haveSpaceEnvPermissions } from '../../spaces/utils/permissions'
import { DEPTH, LOCK_DISCOVERY_PROP, PROPSTAT, STANDARD_PROPS } from '../constants/webdav'
import * as IfHeaderUtils from '../utils/if-header'
import { WebDAVMethods } from './webdav-methods.service'
import { WebDAVSpaces } from './webdav-spaces.service'

// Mock external dependencies
jest.mock('../../files/utils/files', () => ({
  isPathExists: jest.fn(),
  dirName: jest.fn(),
  genEtag: jest.fn().mockReturnValue('W/"etag-123"')
}))

jest.mock('../../spaces/utils/permissions', () => ({
  haveSpaceEnvPermissions: jest.fn()
}))

jest.mock('../../spaces/utils/paths', () => {
  const actual = jest.requireActual('../../spaces/utils/paths')
  return { ...actual, dbFileFromSpace: jest.fn() }
})

jest.mock('../decorators/if-header.decorator', () => ({
  IfHeaderDecorator: () => (_target?: any, _key?: string, _desc?: any) => undefined
}))

describe('WebDAVMethods', () => {
  let service: WebDAVMethods
  let filesManager: jest.Mocked<FilesManager>
  let filesLockManager: jest.Mocked<FilesLockManager>
  let webDAVSpaces: jest.Mocked<WebDAVSpaces>

  // Helper to create a mocked response object
  const createMockResponse = () => {
    const res: any = {
      statusCode: undefined,
      body: undefined,
      headers: {} as Record<string, string>,
      contentType: undefined,
      status(code: number) {
        this.statusCode = code
        return this
      },
      send(payload?: any) {
        this.body = payload
        return this
      },
      header(name: string, value: string) {
        this.headers[name.toLowerCase()] = value
        return this
      },
      type(ct: string) {
        this.contentType = ct
        return this
      }
    }
    return res
  }

  // Helper to create a base request object
  const createBaseRequest = (overrides: Partial<any> = {}) =>
    ({
      method: 'GET',
      user: { id: 1, login: 'test-user' },
      dav: {
        url: '/webdav/test/file.txt',
        depth: '0',
        httpVersion: 'HTTP/1.1',
        body: '<lockinfo/>',
        lock: {
          timeout: 60,
          lockscope: 'exclusive',
          owner: 'test-user',
          token: 'opaquelocktoken:abc123'
        },
        ifHeaders: []
      },
      space: {
        id: 1,
        alias: 'test-space',
        url: '/webdav/test/file.txt',
        realPath: '/real/path/to/file.txt',
        inSharesList: false,
        dbFile: { path: 'file.txt', spaceId: 1, inTrash: false }
      },
      ...overrides
    }) as any

  beforeEach(async () => {
    // Initialize mocks
    filesManager = {
      sendFileFromSpace: jest.fn(),
      mkFile: jest.fn(),
      saveStream: jest.fn(),
      delete: jest.fn(),
      touch: jest.fn(),
      mkDir: jest.fn(),
      copyMove: jest.fn()
    } as any

    filesLockManager = {
      create: jest.fn(),
      isLockedWithToken: jest.fn(),
      removeLock: jest.fn(),
      browseLocks: jest.fn(),
      browseParentChildLocks: jest.fn(),
      checkConflicts: jest.fn(),
      getLocksByPath: jest.fn(),
      getLockByToken: jest.fn(),
      refreshLockTimeout: jest.fn(),
      genDAVToken: jest.fn().mockReturnValue('opaquelocktoken:new-token')
    } as any

    webDAVSpaces = {
      propfind: jest.fn(),
      spaceEnv: jest.fn()
    } as any

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebDAVMethods,
        { provide: WebDAVSpaces, useValue: webDAVSpaces },
        { provide: FilesManager, useValue: filesManager },
        { provide: FilesLockManager, useValue: filesLockManager }
      ]
    }).compile()

    module.useLogger(['fatal'])
    service = module.get<WebDAVMethods>(WebDAVMethods)

    // Reset global mocks
    jest.clearAllMocks()
    ;(isPathExists as jest.Mock).mockResolvedValue(true)
    ;(dirName as jest.Mock).mockReturnValue('/real/path/to')
    ;(haveSpaceEnvPermissions as jest.Mock).mockReturnValue(true)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('Service initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined()
      expect(service).toBeInstanceOf(WebDAVMethods)
    })
  })

  describe('headOrGet', () => {
    describe('Success cases', () => {
      it('should stream file when repository is FILES and not in shares list', async () => {
        const req = createBaseRequest()
        const res = createMockResponse()
        const streamable = { stream: 'file-content' }
        const sendFile = {
          checks: jest.fn().mockResolvedValue(undefined),
          stream: jest.fn().mockResolvedValue(streamable)
        }
        filesManager.sendFileFromSpace.mockReturnValue(sendFile as any)

        const result = await service.headOrGet(req, res, SPACE_REPOSITORY.FILES)

        expect(filesManager.sendFileFromSpace).toHaveBeenCalledWith(req.space)
        expect(sendFile.checks).toHaveBeenCalledTimes(1)
        expect(sendFile.stream).toHaveBeenCalledWith(req, res)
        expect(result).toBe(streamable)
      })
    })

    describe('Error cases', () => {
      it('should return 403 when repository is not FILES', async () => {
        const req = createBaseRequest()
        const res = createMockResponse()

        await service.headOrGet(req, res, 'OTHER_REPO')

        expect(res.statusCode).toBe(HttpStatus.FORBIDDEN)
        expect(res.body).toBe('Not allowed on this resource')
      })

      it('should return 403 when resource is in shares list', async () => {
        const req = createBaseRequest({ space: { ...createBaseRequest().space, inSharesList: true } })
        const res = createMockResponse()

        await service.headOrGet(req, res, SPACE_REPOSITORY.FILES)

        expect(res.statusCode).toBe(HttpStatus.FORBIDDEN)
        expect(res.body).toBe('Not allowed on this resource')
      })

      it('should handle errors from sendFile.checks', async () => {
        const req = createBaseRequest()
        const res = createMockResponse()
        const error = new Error('File check failed')
        const sendFile = {
          checks: jest.fn().mockRejectedValue(error),
          stream: jest.fn()
        }
        filesManager.sendFileFromSpace.mockReturnValue(sendFile as any)
        jest.spyOn<any, any>(service, 'handleError').mockReturnValue('error-handled')

        const result = await service.headOrGet(req, res, SPACE_REPOSITORY.FILES)

        expect(result).toBe('error-handled')
      })

      it('should handle errors from sendFile.stream', async () => {
        const req = createBaseRequest()
        const res = createMockResponse()
        const error = new Error('Stream failed')
        const sendFile = {
          checks: jest.fn().mockResolvedValue(undefined),
          stream: jest.fn().mockRejectedValue(error)
        }
        filesManager.sendFileFromSpace.mockReturnValue(sendFile as any)
        jest.spyOn<any, any>(service, 'handleError').mockReturnValue('error-handled')

        const result = await service.headOrGet(req, res, SPACE_REPOSITORY.FILES)

        expect(result).toBe('error-handled')
      })
    })
  })

  describe('lock', () => {
    describe('Lock refresh (without body)', () => {
      it('should return 400 if resource does not exist for lock refresh', async () => {
        ;(isPathExists as jest.Mock).mockResolvedValue(false)
        const req = createBaseRequest({ dav: { ...createBaseRequest().dav, body: undefined } })
        const res = createMockResponse()

        await service.lock(req, res)

        expect(res.statusCode).toBe(HttpStatus.BAD_REQUEST)
        expect(res.body).toBe('Lock refresh must specify an existing resource')
      })

      it('should delegate to lockRefresh when resource exists and no body', async () => {
        ;(isPathExists as jest.Mock).mockResolvedValue(true)
        const req = createBaseRequest({ dav: { ...createBaseRequest().dav, body: undefined } })
        const res = createMockResponse()
        const lockRefreshSpy = jest.spyOn<any, any>(service, 'lockRefresh').mockResolvedValue('refresh-ok')

        const result = await service.lock(req, res)

        expect(lockRefreshSpy).toHaveBeenCalledWith(req, res, req.space.dbFile.path)
        expect(result).toBe('refresh-ok')
      })
    })

    describe('Lock creation on existing resource', () => {
      it('should create lock successfully and return 200', async () => {
        ;(isPathExists as jest.Mock).mockResolvedValue(true)
        const req = createBaseRequest()
        const res = createMockResponse()

        filesLockManager.create.mockImplementation(async (_user, _dbFile, _app, _depth, options, _timeout) => {
          return [
            true,
            {
              dbFilePath: _dbFile?.path,
              options: {
                lockRoot: options.lockRoot,
                lockToken: options.lockToken,
                lockScope: options.lockScope,
                lockInfo: options.lockInfo
              }
            } as Partial<FileLock>
          ] as any
        })

        await service.lock(req, res)

        expect(filesLockManager.create).toHaveBeenCalledTimes(1)
        expect(res.statusCode).toBe(HttpStatus.OK)
        expect(res.contentType).toBe('application/xml; charset=utf-8')
        expect(res.headers['lock-token']).toContain('opaquelocktoken:new-token')
        expect(res.body).toBeDefined()
        expect(typeof res.body).toBe('string')
      })
    })

    describe('Lock creation on non-existent resource', () => {
      it('should return 403 when user lacks ADD permission', async () => {
        ;(isPathExists as jest.Mock).mockResolvedValue(false)
        ;(haveSpaceEnvPermissions as jest.Mock).mockReturnValue(false)
        const req = createBaseRequest()
        const res = createMockResponse()

        await service.lock(req, res)

        expect(res.statusCode).toBe(HttpStatus.FORBIDDEN)
        expect(res.body).toBe('You are not allowed to do this action')
        expect(filesLockManager.create).not.toHaveBeenCalled()
      })

      it('should return 409 when parent directory does not exist', async () => {
        ;(isPathExists as jest.Mock)
          .mockResolvedValueOnce(false) // resource
          .mockResolvedValueOnce(false) // parent
        ;(haveSpaceEnvPermissions as jest.Mock).mockReturnValue(true)
        ;(dirName as jest.Mock).mockReturnValue('/real/path/missing')
        const req = createBaseRequest()
        const res = createMockResponse()

        await service.lock(req, res)

        expect(res.statusCode).toBe(HttpStatus.CONFLICT)
        expect(res.body).toBe('Parent must exists')
        expect(filesLockManager.create).not.toHaveBeenCalled()
      })

      it('should create empty file and lock, return 201', async () => {
        ;(isPathExists as jest.Mock)
          .mockResolvedValueOnce(false) // resource
          .mockResolvedValueOnce(true) // parent exists
        const req = createBaseRequest()
        const res = createMockResponse()

        filesLockManager.create.mockImplementation(async (_user, _dbFile, _app, _depth, options) => {
          return [
            true,
            {
              dbFilePath: _dbFile?.path,
              options: {
                lockRoot: options.lockRoot,
                lockToken: options.lockToken,
                lockScope: options.lockScope,
                lockInfo: options.lockInfo
              }
            }
          ] as any
        })

        await service.lock(req, res)

        expect(filesManager.mkFile).toHaveBeenCalledWith(req.user, req.space, false, false, false)
        expect(res.statusCode).toBe(HttpStatus.CREATED)
        expect(res.headers['lock-token']).toContain('opaquelocktoken:new-token')
      })
    })

    describe('Lock conflict', () => {
      it('should return 423 when lock conflict occurs', async () => {
        ;(isPathExists as jest.Mock).mockResolvedValue(true)
        const req = createBaseRequest()
        const res = createMockResponse()

        filesLockManager.create.mockResolvedValue([
          false,
          {
            dbFilePath: 'file.txt',
            options: { lockRoot: '/webdav/locked/resource' }
          }
        ] as any)

        await service.lock(req, res)

        expect(res.statusCode).toBe(HttpStatus.LOCKED)
        expect(res.contentType).toBe('application/xml; charset=utf-8')
      })
    })
  })

  describe('unlock', () => {
    describe('Success cases', () => {
      it('should unlock resource and return 204', async () => {
        ;(isPathExists as jest.Mock).mockResolvedValue(true)
        filesLockManager.isLockedWithToken.mockResolvedValue({
          owner: { id: 1, login: 'test-user' },
          key: 'lock-key-123'
        } as any)
        const req = createBaseRequest()
        const res = createMockResponse()

        await service.unlock(req, res)

        expect(filesLockManager.removeLock).toHaveBeenCalledWith('lock-key-123')
        expect(res.statusCode).toBe(HttpStatus.NO_CONTENT)
      })
    })

    describe('Error cases', () => {
      it('should return 404 when resource does not exist', async () => {
        ;(isPathExists as jest.Mock).mockResolvedValue(false)
        const req = createBaseRequest()
        const res = createMockResponse()

        await service.unlock(req, res)

        expect(res.statusCode).toBe(HttpStatus.NOT_FOUND)
        expect(res.body).toBe(req.dav.url)
      })

      it('should return 409 when lock token does not exist', async () => {
        ;(isPathExists as jest.Mock).mockResolvedValue(true)
        filesLockManager.isLockedWithToken.mockResolvedValue(null)
        const req = createBaseRequest()
        const res = createMockResponse()

        await service.unlock(req, res)

        expect(filesLockManager.isLockedWithToken).toHaveBeenCalledWith(req.dav.lock.token, req.space.dbFile.path)
        expect(res.statusCode).toBe(HttpStatus.CONFLICT)
      })

      it('should return 403 when lock owner is different user', async () => {
        ;(isPathExists as jest.Mock).mockResolvedValue(true)
        filesLockManager.isLockedWithToken.mockResolvedValue({
          owner: { id: 999, login: 'other-user' },
          key: 'lock-key-456'
        } as any)
        const req = createBaseRequest()
        const res = createMockResponse()

        await service.unlock(req, res)

        expect(res.statusCode).toBe(HttpStatus.FORBIDDEN)
        expect(res.body).toBe('Token was created by another user')
        expect(filesLockManager.removeLock).not.toHaveBeenCalled()
      })
    })
  })

  describe('propfind', () => {
    describe('Base cases', () => {
      it('should return 404 when resource does not exist in FILES repository', async () => {
        ;(isPathExists as jest.Mock).mockResolvedValue(false)
        const req = createBaseRequest({ dav: { ...createBaseRequest().dav, propfindMode: 'prop' } })
        const res = createMockResponse()

        const result = await service.propfind(req, res, SPACE_REPOSITORY.FILES)

        expect(result).toBe(res)
        expect(res.statusCode).toBe(HttpStatus.NOT_FOUND)
        expect(res.body).toBe(req.dav.url)
      })

      it('should return multistatus with property names in PROPNAME mode', async () => {
        ;(isPathExists as jest.Mock).mockResolvedValue(true)
        const req = createBaseRequest({
          dav: { ...createBaseRequest().dav, propfindMode: 'propname' }
        })
        const res = createMockResponse()

        webDAVSpaces.propfind.mockImplementation(async function* () {
          yield { href: '/webdav/test/file.txt', name: 'file.txt' }
        } as any)

        await service.propfind(req, res, SPACE_REPOSITORY.FILES)

        expect(res.statusCode).toBe(HttpStatus.MULTI_STATUS)
        expect(res.contentType).toContain('application/xml')
        expect(typeof res.body).toBe('string')
        expect(res.body).toContain('/webdav/test/file.txt')
      })

      it('should return multistatus with property values in PROP mode', async () => {
        ;(isPathExists as jest.Mock).mockResolvedValue(true)
        const req = createBaseRequest({
          dav: {
            ...createBaseRequest().dav,
            propfindMode: 'prop',
            body: { propfind: { prop: { [STANDARD_PROPS[0]]: '' } } }
          }
        })
        const res = createMockResponse()

        webDAVSpaces.propfind.mockImplementation(async function* () {
          yield {
            href: '/webdav/test/file.txt',
            name: 'file.txt',
            getlastmodified: 'Mon, 01 Jan 2024 00:00:00 GMT'
          }
        } as any)

        await service.propfind(req, res, SPACE_REPOSITORY.FILES)

        expect(res.statusCode).toBe(HttpStatus.MULTI_STATUS)
        expect(res.contentType).toContain('application/xml')
        expect(typeof res.body).toBe('string')
      })
    })

    describe('Lock discovery', () => {
      it('should collect locks with depth 0', async () => {
        ;(isPathExists as jest.Mock).mockResolvedValue(true)
        const req = createBaseRequest({
          dav: {
            ...createBaseRequest().dav,
            propfindMode: 'prop',
            depth: DEPTH.RESOURCE,
            body: { propfind: { prop: { [LOCK_DISCOVERY_PROP]: '' } } }
          }
        })
        const res = createMockResponse()

        webDAVSpaces.propfind.mockImplementation(async function* () {
          yield { href: '/webdav/test/file.txt', name: 'file.txt' }
        } as any)

        filesLockManager.browseLocks.mockResolvedValue({
          'file.txt': {
            options: { lockRoot: '/webdav/test/file.txt' }
          }
        } as any)

        await service.propfind(req, res, SPACE_REPOSITORY.FILES)

        expect(filesLockManager.browseLocks).toHaveBeenCalledWith(req.space.dbFile)
        expect(res.statusCode).toBe(HttpStatus.MULTI_STATUS)
      })

      it('should collect parent and child locks with depth infinity', async () => {
        ;(isPathExists as jest.Mock).mockResolvedValue(true)
        const req = createBaseRequest({
          dav: {
            ...createBaseRequest().dav,
            propfindMode: 'prop',
            depth: 'infinity',
            body: { propfind: { prop: { [LOCK_DISCOVERY_PROP]: '' } } }
          }
        })
        const res = createMockResponse()

        webDAVSpaces.propfind.mockImplementation(async function* () {
          yield { href: '/webdav/test/file.txt', name: 'file.txt' }
        } as any)

        filesLockManager.browseParentChildLocks.mockResolvedValue({
          'file.txt': {
            options: { lockRoot: '/webdav/test/file.txt' }
          }
        } as any)

        await service.propfind(req, res, SPACE_REPOSITORY.FILES)

        expect(filesLockManager.browseParentChildLocks).toHaveBeenCalledWith(req.space.dbFile)
        expect(res.statusCode).toBe(HttpStatus.MULTI_STATUS)
      })

      it('should not collect locks for PROPNAME mode', async () => {
        ;(isPathExists as jest.Mock).mockResolvedValue(true)
        const req = createBaseRequest({
          dav: { ...createBaseRequest().dav, propfindMode: PROPSTAT.PROPNAME }
        })
        const res = createMockResponse()

        webDAVSpaces.propfind.mockImplementation(async function* () {
          yield { href: '/webdav/test', name: 'test' }
        } as any)

        await service.propfind(req, res, SPACE_REPOSITORY.FILES)

        expect(filesLockManager.browseLocks).not.toHaveBeenCalled()
        expect(filesLockManager.browseParentChildLocks).not.toHaveBeenCalled()
      })

      it('should not collect locks for shares list', async () => {
        ;(isPathExists as jest.Mock).mockResolvedValue(true)
        const req = createBaseRequest({
          space: { ...createBaseRequest().space, inSharesList: true },
          dav: {
            ...createBaseRequest().dav,
            propfindMode: 'prop',
            body: { propfind: { prop: { [LOCK_DISCOVERY_PROP]: '' } } }
          }
        })
        const res = createMockResponse()

        webDAVSpaces.propfind.mockImplementation(async function* () {
          yield { href: '/webdav/shares', name: 'shares' }
        } as any)

        await service.propfind(req, res, SPACE_REPOSITORY.FILES)

        expect(filesLockManager.browseLocks).not.toHaveBeenCalled()
      })
    })
  })

  describe('put', () => {
    describe('Success cases', () => {
      it('should return 204 when updating existing file', async () => {
        filesManager.saveStream.mockResolvedValue(true) // file existed
        const req = createBaseRequest({ method: 'PUT' })
        const res = createMockResponse()

        const result = await service.put(req, res)

        expect(filesManager.saveStream).toHaveBeenCalledWith(req.user, req.space, req, expect.objectContaining({ dav: expect.any(Object) }))
        expect(res.statusCode).toBe(HttpStatus.NO_CONTENT)
        expect(res.headers['etag']).toBeDefined()
        expect(result).toBe(res)
      })

      it('should return 201 when creating new file', async () => {
        filesManager.saveStream.mockResolvedValue(false) // file didn't exist
        const req = createBaseRequest({ method: 'PUT' })
        const res = createMockResponse()

        const result = await service.put(req, res)

        expect(res.statusCode).toBe(HttpStatus.CREATED)
        expect(res.headers['etag']).toBeDefined()
        expect(result).toBe(res)
      })

      it('should extract and pass lock tokens from if-headers', async () => {
        filesManager.saveStream.mockResolvedValue(true)
        const req = createBaseRequest({
          method: 'PUT',
          dav: {
            ...createBaseRequest().dav,
            ifHeaders: [{ token: { value: 'opaquelocktoken:xyz', mustMatch: true } }]
          }
        })
        const res = createMockResponse()
        jest.spyOn(IfHeaderUtils, 'extractAllTokens').mockReturnValue(['opaquelocktoken:xyz'])

        await service.put(req, res)

        expect(filesManager.saveStream).toHaveBeenCalledWith(
          req.user,
          req.space,
          req,
          expect.objectContaining({
            dav: expect.objectContaining({
              lockTokens: ['opaquelocktoken:xyz']
            })
          })
        )
      })
    })

    describe('Error handling', () => {
      it('should handle lock conflict error', async () => {
        const lockError = new LockConflict(
          {
            dbFilePath: 'file.txt',
            options: { lockRoot: '/webdav/locked' }
          } as any,
          'Lock conflict'
        )
        filesManager.saveStream.mockRejectedValue(lockError)
        const req = createBaseRequest({ method: 'PUT' })
        const res = createMockResponse()

        await service.put(req, res)

        expect(res.statusCode).toBe(HttpStatus.LOCKED)
      })

      it('should handle file error', async () => {
        const fileError = new FileError(409, 'File conflict')
        filesManager.saveStream.mockRejectedValue(fileError)
        const req = createBaseRequest({ method: 'PUT' })
        const res = createMockResponse()

        await service.put(req, res)

        expect(res.statusCode).toBe(409)
        expect(res.body).toBe('File conflict')
      })

      it('should throw HttpException for unexpected errors', async () => {
        const unexpectedError = new Error('Unexpected error')
        filesManager.saveStream.mockRejectedValue(unexpectedError)
        const req = createBaseRequest({ method: 'PUT' })
        const res = createMockResponse()

        await expect(service.put(req, res)).rejects.toThrow(HttpException)
      })
    })
  })

  describe('delete', () => {
    describe('Success cases', () => {
      it('should delete resource and return 204', async () => {
        filesManager.delete.mockResolvedValue(undefined)
        const req = createBaseRequest({ method: 'DELETE' })
        const res = createMockResponse()

        const result = await service.delete(req, res)

        expect(filesManager.delete).toHaveBeenCalledWith(req.user, req.space, expect.objectContaining({ lockTokens: expect.any(Array) }))
        expect(res.statusCode).toBe(HttpStatus.NO_CONTENT)
        expect(result).toBe(res)
      })

      it('should extract lock tokens from if-headers', async () => {
        filesManager.delete.mockResolvedValue(undefined)
        const req = createBaseRequest({
          method: 'DELETE',
          dav: {
            ...createBaseRequest().dav,
            ifHeaders: [{ token: { value: 'opaquelocktoken:abc', mustMatch: true } }]
          }
        })
        const res = createMockResponse()
        jest.spyOn(IfHeaderUtils, 'extractAllTokens').mockReturnValue(['opaquelocktoken:abc'])

        await service.delete(req, res)

        expect(filesManager.delete).toHaveBeenCalledWith(req.user, req.space, expect.objectContaining({ lockTokens: ['opaquelocktoken:abc'] }))
      })
    })

    describe('Error handling', () => {
      it('should handle lock conflict', async () => {
        const lockError = new LockConflict(
          {
            dbFilePath: 'file.txt',
            options: { lockRoot: '/webdav/locked' }
          } as any,
          'Lock conflict'
        )
        filesManager.delete.mockRejectedValue(lockError)
        const req = createBaseRequest({ method: 'DELETE' })
        const res = createMockResponse()

        await service.delete(req, res)

        expect(res.statusCode).toBe(HttpStatus.LOCKED)
      })

      it('should handle file errors', async () => {
        const fileError = new FileError(404, 'File not found')
        filesManager.delete.mockRejectedValue(fileError)
        const req = createBaseRequest({ method: 'DELETE' })
        const res = createMockResponse()

        await service.delete(req, res)

        expect(res.statusCode).toBe(404)
        expect(res.body).toBe('File not found')
      })

      it('should throw HttpException for unexpected errors', async () => {
        const unexpectedError = new Error('Database error')
        filesManager.delete.mockRejectedValue(unexpectedError)
        const req = createBaseRequest({ method: 'DELETE' })
        const res = createMockResponse()

        await expect(service.delete(req, res)).rejects.toThrow(HttpException)
      })
    })
  })

  describe('proppatch', () => {
    describe('Base cases', () => {
      it('should return 404 when resource does not exist', async () => {
        ;(isPathExists as jest.Mock).mockResolvedValue(false)
        const req = createBaseRequest({
          method: 'PROPPATCH',
          dav: {
            ...createBaseRequest().dav,
            body: { propertyupdate: { set: { prop: [{ lastmodified: '2024-01-01' }] } } }
          }
        })
        const res = createMockResponse()

        await service.proppatch(req, res)

        expect(res.statusCode).toBe(HttpStatus.NOT_FOUND)
        expect(res.body).toBe(req.dav.url)
      })

      it('should return 400 for unknown action tag', async () => {
        ;(isPathExists as jest.Mock).mockResolvedValue(true)
        const req = createBaseRequest({
          method: 'PROPPATCH',
          dav: {
            ...createBaseRequest().dav,
            body: { propertyupdate: { invalidaction: {} } }
          }
        })
        const res = createMockResponse()

        await service.proppatch(req, res)

        expect(res.statusCode).toBe(HttpStatus.BAD_REQUEST)
        expect(res.body).toContain('Unknown tag')
      })

      it('should return 400 when missing prop tag', async () => {
        ;(isPathExists as jest.Mock).mockResolvedValue(true)
        const req = createBaseRequest({
          method: 'PROPPATCH',
          dav: {
            ...createBaseRequest().dav,
            body: { propertyupdate: { set: { notprop: {} } } }
          }
        })
        const res = createMockResponse()

        await service.proppatch(req, res)

        expect(res.statusCode).toBe(HttpStatus.BAD_REQUEST)
        expect(res.body).toContain('Unknown tag')
      })
    })

    describe('SET action', () => {
      it('should successfully modify lastmodified property', async () => {
        ;(isPathExists as jest.Mock).mockResolvedValue(true)
        filesLockManager.checkConflicts.mockResolvedValue(undefined)
        filesManager.touch.mockResolvedValue(undefined)
        const req = createBaseRequest({
          method: 'PROPPATCH',
          dav: {
            ...createBaseRequest().dav,
            httpVersion: 'HTTP/1.1',
            body: { propertyupdate: { set: { prop: [{ lastmodified: '2024-01-01' }] } } }
          }
        })
        const res = createMockResponse()

        await service.proppatch(req, res)

        expect(filesManager.touch).toHaveBeenCalled()
        expect(res.statusCode).toBe(HttpStatus.MULTI_STATUS)
        expect(res.contentType).toContain('application/xml')
        expect(typeof res.body).toBe('string')
        expect(res.body).toContain('lastmodified')
        expect(res.body).toContain('200')
      })

      it('should return 207 with 403 for unsupported properties', async () => {
        ;(isPathExists as jest.Mock).mockResolvedValue(true)
        filesLockManager.checkConflicts.mockResolvedValue(undefined)
        const req = createBaseRequest({
          method: 'PROPPATCH',
          dav: {
            ...createBaseRequest().dav,
            httpVersion: 'HTTP/1.1',
            body: { propertyupdate: { set: { prop: [{ unsupportedProp: 'value' }] } } }
          }
        })
        const res = createMockResponse()

        await service.proppatch(req, res)

        expect(res.statusCode).toBe(HttpStatus.MULTI_STATUS)
        expect(res.body).toContain('unsupportedProp')
        expect(res.body).toContain('403')
      })

      it('should handle Win32 properties correctly', async () => {
        ;(isPathExists as jest.Mock).mockResolvedValue(true)
        filesLockManager.checkConflicts.mockResolvedValue(undefined)
        const req = createBaseRequest({
          method: 'PROPPATCH',
          dav: {
            ...createBaseRequest().dav,
            httpVersion: 'HTTP/1.1',
            body: { propertyupdate: { set: { prop: [{ Win32CreationTime: '2024-01-01' }] } } }
          }
        })
        const res = createMockResponse()

        await service.proppatch(req, res)

        expect(filesManager.touch).not.toHaveBeenCalled()
        expect(res.statusCode).toBe(HttpStatus.MULTI_STATUS)
        expect(res.body).toContain('Win32CreationTime')
        expect(res.body).toContain('200')
      })

      it('should return 424 failed dependency when touch fails', async () => {
        ;(isPathExists as jest.Mock).mockResolvedValue(true)
        filesLockManager.checkConflicts.mockResolvedValue(undefined)
        filesManager.touch.mockRejectedValue(new Error('Touch failed'))
        const req = createBaseRequest({
          method: 'PROPPATCH',
          dav: {
            ...createBaseRequest().dav,
            httpVersion: 'HTTP/1.1',
            body: { propertyupdate: { set: { prop: [{ lastmodified: '2024-01-01' }] } } }
          }
        })
        const res = createMockResponse()

        await service.proppatch(req, res)

        expect(res.statusCode).toBe(HttpStatus.MULTI_STATUS)
        expect(res.body).toContain('424')
      })

      it('should mark supported props as 424 when unsupported prop fails', async () => {
        ;(isPathExists as jest.Mock).mockResolvedValue(true)
        filesLockManager.checkConflicts.mockResolvedValue(undefined)
        const req = createBaseRequest({
          method: 'PROPPATCH',
          dav: {
            ...createBaseRequest().dav,
            httpVersion: 'HTTP/1.1',
            body: {
              propertyupdate: {
                set: { prop: [{ unsupportedProp: 'fail' }, { Win32CreationTime: 'ok' }] }
              }
            }
          }
        })
        const res = createMockResponse()

        await service.proppatch(req, res)

        expect(res.statusCode).toBe(HttpStatus.MULTI_STATUS)
        expect(res.body).toContain('unsupportedProp')
        expect(res.body).toContain('403')
        expect(res.body).toContain('Win32CreationTime')
        expect(res.body).toContain('424')
      })
    })

    describe('REMOVE action', () => {
      it('should handle REMOVE action on supported property', async () => {
        ;(isPathExists as jest.Mock).mockResolvedValue(true)
        filesLockManager.checkConflicts.mockResolvedValue(undefined)
        const req = createBaseRequest({
          method: 'PROPPATCH',
          dav: {
            ...createBaseRequest().dav,
            httpVersion: 'HTTP/1.1',
            body: {
              propertyupdate: {
                remove: { prop: [{ Win32CreationTime: '' }] }
              }
            }
          }
        })
        const res = createMockResponse()

        await service.proppatch(req, res)

        expect(filesManager.touch).not.toHaveBeenCalled()
        expect(res.statusCode).toBe(HttpStatus.MULTI_STATUS)
        expect(res.body).toContain('Win32CreationTime')
        expect(res.body).toContain('200')
      })
    })

    describe('Data normalization', () => {
      it('should normalize array of propertyupdate items', async () => {
        ;(isPathExists as jest.Mock).mockResolvedValue(true)
        filesLockManager.checkConflicts.mockResolvedValue(undefined)
        filesManager.touch.mockResolvedValue(undefined)
        const req = createBaseRequest({
          method: 'PROPPATCH',
          dav: {
            ...createBaseRequest().dav,
            httpVersion: 'HTTP/1.1',
            body: {
              propertyupdate: {
                set: [{ prop: { lastmodified: '2024-01-01' } }, { prop: { Win32CreationTime: 'ok' } }]
              }
            }
          }
        })
        const res = createMockResponse()

        await service.proppatch(req, res)

        expect(filesManager.touch).toHaveBeenCalled()
        expect(res.statusCode).toBe(HttpStatus.MULTI_STATUS)
        expect(res.body).toContain('lastmodified')
      })

      it('should wrap single prop object into array', async () => {
        ;(isPathExists as jest.Mock).mockResolvedValue(true)
        filesLockManager.checkConflicts.mockResolvedValue(undefined)
        filesManager.touch.mockResolvedValue(undefined)
        const req = createBaseRequest({
          method: 'PROPPATCH',
          dav: {
            ...createBaseRequest().dav,
            httpVersion: 'HTTP/1.1',
            body: {
              propertyupdate: {
                set: { prop: { lastmodified: '2024-01-01' } }
              }
            }
          }
        })
        const res = createMockResponse()

        await service.proppatch(req, res)

        expect(filesManager.touch).toHaveBeenCalled()
        expect(res.statusCode).toBe(HttpStatus.MULTI_STATUS)
      })
    })

    describe('Lock handling', () => {
      it('should check lock conflicts before applying changes', async () => {
        ;(isPathExists as jest.Mock).mockResolvedValue(true)
        filesLockManager.checkConflicts.mockResolvedValue(undefined)
        const req = createBaseRequest({
          method: 'PROPPATCH',
          dav: {
            ...createBaseRequest().dav,
            body: { propertyupdate: { set: { prop: [{ Win32CreationTime: 'ok' }] } } }
          }
        })
        const res = createMockResponse()

        await service.proppatch(req, res)

        expect(filesLockManager.checkConflicts).toHaveBeenCalledWith(
          req.space.dbFile,
          req.dav.depth,
          expect.objectContaining({
            userId: req.user.id,
            lockTokens: expect.any(Array)
          })
        )
      })

      it('should handle lock conflict error', async () => {
        ;(isPathExists as jest.Mock).mockResolvedValue(true)
        const lockError = new LockConflict(
          {
            dbFilePath: 'file.txt',
            options: { lockRoot: '/webdav/locked' }
          } as any,
          'Lock conflict'
        )
        filesLockManager.checkConflicts.mockRejectedValue(lockError)
        const req = createBaseRequest({
          method: 'PROPPATCH',
          dav: {
            ...createBaseRequest().dav,
            body: { propertyupdate: { set: { prop: [{ lastmodified: '2024-01-01' }] } } }
          }
        })
        const res = createMockResponse()

        await service.proppatch(req, res)

        expect(res.statusCode).toBe(HttpStatus.LOCKED)
      })
    })
  })

  describe('mkcol', () => {
    describe('Success cases', () => {
      it('should create directory and return 201', async () => {
        filesManager.mkDir.mockResolvedValue(undefined)
        const req = createBaseRequest({ method: 'MKCOL' })
        const res = createMockResponse()

        await service.mkcol(req, res)

        expect(filesManager.mkDir).toHaveBeenCalledWith(
          req.user,
          req.space,
          false,
          expect.objectContaining({
            depth: req.dav.depth,
            lockTokens: expect.any(Array)
          })
        )
        expect(res.statusCode).toBe(HttpStatus.CREATED)
      })
    })

    describe('Error handling', () => {
      it('should handle lock conflict', async () => {
        const lockError = new LockConflict(
          {
            dbFilePath: 'dir',
            options: { lockRoot: '/webdav/locked' }
          } as any,
          'Lock conflict'
        )
        filesManager.mkDir.mockRejectedValue(lockError)
        const req = createBaseRequest({ method: 'MKCOL' })
        const res = createMockResponse()

        await service.mkcol(req, res)

        expect(res.statusCode).toBe(HttpStatus.LOCKED)
      })

      it('should handle file errors', async () => {
        const fileError = new FileError(409, 'Directory already exists')
        filesManager.mkDir.mockRejectedValue(fileError)
        const req = createBaseRequest({ method: 'MKCOL' })
        const res = createMockResponse()

        await service.mkcol(req, res)

        expect(res.statusCode).toBe(409)
        expect(res.body).toBe('Directory already exists')
      })

      it('should throw HttpException for unexpected errors', async () => {
        const unexpectedError = new Error('Filesystem error')
        filesManager.mkDir.mockRejectedValue(unexpectedError)
        const req = createBaseRequest({ method: 'MKCOL' })
        const res = createMockResponse()

        await expect(service.mkcol(req, res)).rejects.toThrow(HttpException)
      })
    })
  })

  describe('copyMove', () => {
    describe('Base cases', () => {
      it('should return 404 when destination space not found', async () => {
        webDAVSpaces.spaceEnv.mockResolvedValue(null)
        const req = createBaseRequest({
          method: 'MOVE',
          dav: {
            ...createBaseRequest().dav,
            copyMove: { destination: '/webdav/unknown', isMove: true, overwrite: false }
          }
        })
        const res = createMockResponse()

        await service.copyMove(req, res)

        expect(res.statusCode).toBe(HttpStatus.NOT_FOUND)
        expect(res.body).toBe('/webdav/unknown')
      })
    })

    describe('COPY operation', () => {
      it('should copy file and return 201 when destination does not exist', async () => {
        const dstSpace = {
          ...createBaseRequest().space,
          url: '/webdav/test/copy.txt',
          realPath: '/real/path/to/copy.txt',
          dbFile: { path: 'copy.txt', spaceId: 1, inTrash: false }
        }
        webDAVSpaces.spaceEnv.mockResolvedValue(dstSpace)
        ;(isPathExists as jest.Mock).mockResolvedValue(false)
        jest.spyOn<any, any>(service, 'evaluateIfHeaders').mockResolvedValue(true)
        filesManager.copyMove.mockResolvedValue(undefined)
        const req = createBaseRequest({
          method: 'COPY',
          dav: {
            ...createBaseRequest().dav,
            copyMove: { destination: '/webdav/test/copy.txt', isMove: false, overwrite: false }
          }
        })
        const res = createMockResponse()

        await service.copyMove(req, res)

        expect(filesManager.copyMove).toHaveBeenCalledWith(
          req.user,
          req.space,
          dstSpace,
          false,
          false,
          false,
          expect.objectContaining({
            depth: req.dav.depth,
            lockTokens: expect.any(Array)
          })
        )
        expect(res.statusCode).toBe(HttpStatus.CREATED)
      })

      it('should copy file and return 204 when destination exists', async () => {
        const dstSpace = {
          ...createBaseRequest().space,
          url: '/webdav/test/existing.txt',
          realPath: '/real/path/to/existing.txt',
          dbFile: { path: 'existing.txt', spaceId: 1, inTrash: false }
        }
        webDAVSpaces.spaceEnv.mockResolvedValue(dstSpace)
        ;(isPathExists as jest.Mock).mockResolvedValue(true)
        jest.spyOn<any, any>(service, 'evaluateIfHeaders').mockResolvedValue(true)
        filesManager.copyMove.mockResolvedValue(undefined)
        const req = createBaseRequest({
          method: 'COPY',
          dav: {
            ...createBaseRequest().dav,
            copyMove: { destination: '/webdav/test/existing.txt', isMove: false, overwrite: true }
          }
        })
        const res = createMockResponse()

        await service.copyMove(req, res)

        expect(res.statusCode).toBe(HttpStatus.NO_CONTENT)
      })
    })

    describe('MOVE operation', () => {
      it('should move file and return 201 when destination does not exist', async () => {
        const dstSpace = {
          ...createBaseRequest().space,
          url: '/webdav/test/moved.txt',
          realPath: '/real/path/to/moved.txt',
          dbFile: { path: 'moved.txt', spaceId: 1, inTrash: false }
        }
        webDAVSpaces.spaceEnv.mockResolvedValue(dstSpace)
        ;(isPathExists as jest.Mock).mockResolvedValue(false)
        jest.spyOn<any, any>(service, 'evaluateIfHeaders').mockResolvedValue(true)
        filesManager.copyMove.mockResolvedValue(undefined)
        const req = createBaseRequest({
          method: 'MOVE',
          dav: {
            ...createBaseRequest().dav,
            copyMove: { destination: '/webdav/test/moved.txt', isMove: true, overwrite: false }
          }
        })
        const res = createMockResponse()

        await service.copyMove(req, res)

        expect(filesManager.copyMove).toHaveBeenCalledWith(req.user, req.space, dstSpace, true, false, false, expect.any(Object))
        expect(res.statusCode).toBe(HttpStatus.CREATED)
      })

      it('should move file and return 204 when destination exists', async () => {
        const dstSpace = {
          ...createBaseRequest().space,
          url: '/webdav/test/existing.txt',
          realPath: '/real/path/to/existing.txt',
          dbFile: { path: 'existing.txt', spaceId: 1, inTrash: false }
        }
        webDAVSpaces.spaceEnv.mockResolvedValue(dstSpace)
        ;(isPathExists as jest.Mock).mockResolvedValue(true)
        jest.spyOn<any, any>(service, 'evaluateIfHeaders').mockResolvedValue(true)
        filesManager.copyMove.mockResolvedValue(undefined)
        const req = createBaseRequest({
          method: 'MOVE',
          dav: {
            ...createBaseRequest().dav,
            copyMove: { destination: '/webdav/test/existing.txt', isMove: true, overwrite: true }
          }
        })
        const res = createMockResponse()

        await service.copyMove(req, res)

        expect(res.statusCode).toBe(HttpStatus.NO_CONTENT)
      })
    })

    describe('If-Headers on destination', () => {
      it('should return early when evaluateIfHeaders fails for destination', async () => {
        const dstSpace = {
          ...createBaseRequest().space,
          url: '/webdav/test/dest.txt',
          realPath: '/real/path/to/dest.txt',
          dbFile: { path: 'dest.txt', spaceId: 1, inTrash: false }
        }
        webDAVSpaces.spaceEnv.mockResolvedValue(dstSpace)
        jest.spyOn<any, any>(service, 'evaluateIfHeaders').mockResolvedValue(false)
        const req = createBaseRequest({
          method: 'COPY',
          dav: {
            ...createBaseRequest().dav,
            copyMove: { destination: '/webdav/test/dest.txt', isMove: false, overwrite: true },
            ifHeaders: [{ path: '/webdav/test/dest.txt', etag: { value: 'W/"wrong"', mustMatch: true } }]
          }
        })
        const res = createMockResponse()

        const result = await service.copyMove(req, res)

        expect(result).toBeUndefined()
        expect(filesManager.copyMove).not.toHaveBeenCalled()
      })

      it('should return 412 when destination If-Header haveLock mismatches', async () => {
        const dstSpace = {
          ...createBaseRequest().space,
          url: '/webdav/test/dest.txt',
          realPath: '/real/path/to/dest.txt',
          dbFile: { path: 'dest.txt', spaceId: 1, inTrash: false }
        }
        webDAVSpaces.spaceEnv.mockResolvedValue(dstSpace)
        ;(isPathExists as jest.Mock).mockResolvedValue(true)
        ;(PathsUtils.dbFileFromSpace as jest.Mock).mockReturnValue(dstSpace.dbFile)
        filesLockManager.getLocksByPath.mockResolvedValue([{ key: 'lock1' }] as any)
        const req = createBaseRequest({
          method: 'COPY',
          dav: {
            ...createBaseRequest().dav,
            copyMove: { destination: '/webdav/test/dest.txt', isMove: false, overwrite: true },
            ifHeaders: [{ path: '/webdav/test/dest.txt', haveLock: { mustMatch: false } }]
          }
        })
        const res = createMockResponse()

        const result = await service.copyMove(req, res)

        expect(result).toBeUndefined()
        expect(res.statusCode).toBe(HttpStatus.PRECONDITION_FAILED)
      })
    })

    describe('Error handling', () => {
      it('should handle lock conflict error', async () => {
        const dstSpace = {
          ...createBaseRequest().space,
          url: '/webdav/test/dest.txt',
          realPath: '/real/path/to/dest.txt',
          dbFile: { path: 'dest.txt', spaceId: 1, inTrash: false }
        }
        webDAVSpaces.spaceEnv.mockResolvedValue(dstSpace)
        jest.spyOn<any, any>(service, 'evaluateIfHeaders').mockResolvedValue(true)
        const lockError = new LockConflict(
          {
            dbFilePath: 'dest.txt',
            options: { lockRoot: '/webdav/locked' }
          } as any,
          'Lock conflict'
        )
        filesManager.copyMove.mockRejectedValue(lockError)
        const req = createBaseRequest({
          method: 'COPY',
          dav: {
            ...createBaseRequest().dav,
            copyMove: { destination: '/webdav/test/dest.txt', isMove: false, overwrite: true }
          }
        })
        const res = createMockResponse()

        await service.copyMove(req, res)

        expect(res.statusCode).toBe(HttpStatus.LOCKED)
      })

      it('should handle lock conflict without lockRoot (fallback to dbFilePath)', async () => {
        const dstSpace = {
          ...createBaseRequest().space,
          url: '/webdav/test/dest.txt',
          realPath: '/real/path/to/dest.txt',
          dbFile: { path: 'dest.txt', spaceId: 1, inTrash: false }
        }
        webDAVSpaces.spaceEnv.mockResolvedValue(dstSpace)
        jest.spyOn<any, any>(service, 'evaluateIfHeaders').mockResolvedValue(true)
        const lockError = new LockConflict({ dbFilePath: 'dest.txt' } as any, 'Lock conflict')
        filesManager.copyMove.mockRejectedValue(lockError)
        const req = createBaseRequest({
          method: 'COPY',
          dav: {
            ...createBaseRequest().dav,
            copyMove: { destination: '/webdav/test/dest.txt', isMove: false, overwrite: true }
          }
        })
        const res = createMockResponse()

        await service.copyMove(req, res)

        expect(res.statusCode).toBe(HttpStatus.LOCKED)
      })

      it('should handle file errors', async () => {
        const dstSpace = {
          ...createBaseRequest().space,
          url: '/webdav/test/dest.txt',
          realPath: '/real/path/to/dest.txt',
          dbFile: { path: 'dest.txt', spaceId: 1, inTrash: false }
        }
        webDAVSpaces.spaceEnv.mockResolvedValue(dstSpace)
        jest.spyOn<any, any>(service, 'evaluateIfHeaders').mockResolvedValue(true)
        const fileError = new FileError(409, 'File conflict')
        filesManager.copyMove.mockRejectedValue(fileError)
        const req = createBaseRequest({
          method: 'MOVE',
          dav: {
            ...createBaseRequest().dav,
            copyMove: { destination: '/webdav/test/dest.txt', isMove: true, overwrite: false }
          }
        })
        const res = createMockResponse()

        await service.copyMove(req, res)

        expect(res.statusCode).toBe(409)
        expect(res.body).toBe('File conflict')
      })

      it('should throw HttpException for unexpected errors', async () => {
        const dstSpace = {
          ...createBaseRequest().space,
          url: '/webdav/test/dest.txt',
          realPath: '/real/path/to/dest.txt',
          dbFile: { path: 'dest.txt', spaceId: 1, inTrash: false }
        }
        webDAVSpaces.spaceEnv.mockResolvedValue(dstSpace)
        jest.spyOn<any, any>(service, 'evaluateIfHeaders').mockResolvedValue(true)
        const unexpectedError = new Error('Unexpected filesystem error')
        filesManager.copyMove.mockRejectedValue(unexpectedError)
        const req = createBaseRequest({
          method: 'COPY',
          dav: {
            ...createBaseRequest().dav,
            copyMove: { destination: '/webdav/test/dest.txt', isMove: false, overwrite: true }
          }
        })
        const res = createMockResponse()

        await expect(service.copyMove(req, res)).rejects.toThrow(HttpException)
      })

      it('should include destination URL in error log', async () => {
        const dstSpace = {
          ...createBaseRequest().space,
          url: '/webdav/test/dest.txt',
          realPath: '/real/path/to/dest.txt',
          dbFile: { path: 'dest.txt', spaceId: 1, inTrash: false }
        }
        webDAVSpaces.spaceEnv.mockResolvedValue(dstSpace)
        jest.spyOn<any, any>(service, 'evaluateIfHeaders').mockResolvedValue(true)
        const logSpy = jest.spyOn((service as any)['logger'], 'error').mockImplementation(() => undefined as any)
        filesManager.copyMove.mockRejectedValue(new Error('Copy failed'))
        const req = createBaseRequest({
          method: 'COPY',
          dav: {
            ...createBaseRequest().dav,
            copyMove: { destination: '/webdav/test/dest.txt', isMove: false, overwrite: true }
          }
        })
        const res = createMockResponse()

        try {
          await service.copyMove(req, res)
        } catch {
          // Expected to throw
        }

        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(' -> /webdav/test/dest.txt'))
      })
    })
  })

  describe('evaluateIfHeaders', () => {
    describe('Base cases', () => {
      it('should return true when no if-headers present', async () => {
        const req = createBaseRequest({ dav: { ...createBaseRequest().dav, ifHeaders: undefined } })
        const res = createMockResponse()

        const result = await (service as any).evaluateIfHeaders(req, res)

        expect(result).toBe(true)
        expect(res.statusCode).toBeUndefined()
      })

      it('should return true when at least one condition matches', async () => {
        ;(isPathExists as jest.Mock).mockResolvedValue(true)
        const req = createBaseRequest({
          dav: {
            ...createBaseRequest().dav,
            ifHeaders: [{ etag: { value: 'W/"wrong-etag"', mustMatch: true } }, { etag: { value: 'W/"etag-123"', mustMatch: true } }]
          }
        })
        const res = createMockResponse()

        const result = await (service as any).evaluateIfHeaders(req, res)

        expect(result).toBe(true)
        expect(res.statusCode).toBeUndefined()
      })

      it('should return false when path cannot be resolved', async () => {
        webDAVSpaces.spaceEnv.mockResolvedValue(null)
        const req = createBaseRequest({
          dav: {
            ...createBaseRequest().dav,
            ifHeaders: [{ path: '/webdav/unknown/file.txt' }]
          }
        })
        const res = createMockResponse()

        const result = await (service as any).evaluateIfHeaders(req, res)

        expect(result).toBe(false)
        expect(res.statusCode).toBeUndefined()
      })
    })

    describe('haveLock condition', () => {
      it('should return true when haveLock matches (lock exists, mustMatch=true)', async () => {
        ;(PathsUtils.dbFileFromSpace as jest.Mock).mockReturnValue({ path: 'file.txt', spaceId: 1 })
        filesLockManager.getLocksByPath.mockResolvedValue([{ key: 'lock1' }] as any)
        const req = createBaseRequest({
          dav: {
            ...createBaseRequest().dav,
            ifHeaders: [{ haveLock: { mustMatch: true } }]
          }
        })
        const res = createMockResponse()

        const result = await (service as any).evaluateIfHeaders(req, res)

        expect(result).toBe(true)
      })

      it('should return true when haveLock matches (no lock, mustMatch=false)', async () => {
        ;(PathsUtils.dbFileFromSpace as jest.Mock).mockReturnValue({ path: 'file.txt', spaceId: 1 })
        filesLockManager.getLocksByPath.mockResolvedValue([])
        const req = createBaseRequest({
          dav: {
            ...createBaseRequest().dav,
            ifHeaders: [{ haveLock: { mustMatch: false } }]
          }
        })
        const res = createMockResponse()

        const result = await (service as any).evaluateIfHeaders(req, res)

        expect(result).toBe(true)
      })

      it('should return false with 412 when haveLock mismatches (lock exists, mustMatch=false)', async () => {
        ;(PathsUtils.dbFileFromSpace as jest.Mock).mockReturnValue({ path: 'file.txt', spaceId: 1 })
        filesLockManager.getLocksByPath.mockResolvedValue([{ key: 'lock1' }] as any)
        const req = createBaseRequest({
          dav: {
            ...createBaseRequest().dav,
            ifHeaders: [{ haveLock: { mustMatch: false } }]
          }
        })
        const res = createMockResponse()

        const result = await (service as any).evaluateIfHeaders(req, res)

        expect(result).toBe(false)
        expect(res.statusCode).toBe(HttpStatus.PRECONDITION_FAILED)
      })

      it('should return false with 412 when haveLock mismatches (no lock, mustMatch=true)', async () => {
        ;(PathsUtils.dbFileFromSpace as jest.Mock).mockReturnValue({ path: 'file.txt', spaceId: 1 })
        filesLockManager.getLocksByPath.mockResolvedValue([])
        const req = createBaseRequest({
          dav: {
            ...createBaseRequest().dav,
            ifHeaders: [{ haveLock: { mustMatch: true } }]
          }
        })
        const res = createMockResponse()

        const result = await (service as any).evaluateIfHeaders(req, res)

        expect(result).toBe(false)
        expect(res.statusCode).toBe(HttpStatus.PRECONDITION_FAILED)
      })

      it('should return false with 412 when haveLock lookup throws error', async () => {
        ;(PathsUtils.dbFileFromSpace as jest.Mock).mockReturnValue({ path: 'file.txt', spaceId: 1 })
        filesLockManager.getLocksByPath.mockRejectedValue(new Error('Database error'))
        const req = createBaseRequest({
          dav: {
            ...createBaseRequest().dav,
            ifHeaders: [{ haveLock: { mustMatch: true } }]
          }
        })
        const res = createMockResponse()

        const result = await (service as any).evaluateIfHeaders(req, res)

        expect(result).toBe(false)
        expect(res.statusCode).toBe(HttpStatus.PRECONDITION_FAILED)
        expect(res.body).toBe('If header condition failed')
      })
    })

    describe('token condition', () => {
      it('should return true when token exists and path matches lockroot', async () => {
        filesLockManager.getLockByToken.mockResolvedValue({
          options: { lockRoot: '/webdav/test/file.txt' }
        } as any)
        const req = createBaseRequest({
          dav: {
            ...createBaseRequest().dav,
            ifHeaders: [{ token: { value: 'opaquelocktoken:abc', mustMatch: true } }]
          }
        })
        const res = createMockResponse()

        const result = await (service as any).evaluateIfHeaders(req, res)

        expect(result).toBe(true)
      })

      it('should return true when token exists and path is child of lockroot', async () => {
        filesLockManager.getLockByToken.mockResolvedValue({
          options: { lockRoot: '/webdav/test' }
        } as any)
        const req = createBaseRequest({
          dav: {
            ...createBaseRequest().dav,
            url: '/webdav/test/subfolder/file.txt',
            ifHeaders: [{ token: { value: 'opaquelocktoken:abc', mustMatch: true } }]
          }
        })
        const res = createMockResponse()

        const result = await (service as any).evaluateIfHeaders(req, res)

        expect(result).toBe(true)
      })

      it('should return false with 412 when token not found', async () => {
        filesLockManager.getLockByToken.mockResolvedValue(null)
        const req = createBaseRequest({
          dav: {
            ...createBaseRequest().dav,
            ifHeaders: [{ token: { value: 'opaquelocktoken:missing', mustMatch: true } }]
          }
        })
        const res = createMockResponse()

        const result = await (service as any).evaluateIfHeaders(req, res)

        expect(result).toBe(false)
        expect(res.statusCode).toBe(HttpStatus.PRECONDITION_FAILED)
      })

      it('should return false with 412 when token exists but path does not match lockroot', async () => {
        filesLockManager.getLockByToken.mockResolvedValue({
          options: { lockRoot: '/webdav/other/file.txt' }
        } as any)
        const req = createBaseRequest({
          dav: {
            ...createBaseRequest().dav,
            url: '/webdav/test/file.txt',
            ifHeaders: [{ token: { value: 'opaquelocktoken:abc', mustMatch: true } }]
          }
        })
        const res = createMockResponse()

        const result = await (service as any).evaluateIfHeaders(req, res)

        expect(result).toBe(false)
        expect(res.statusCode).toBe(HttpStatus.PRECONDITION_FAILED)
      })

      it('should evaluate token condition with explicit path in if-header', async () => {
        const explicitSpace = {
          ...createBaseRequest().space,
          url: '/webdav/explicit/path.txt',
          realPath: '/real/path/to/explicit.txt',
          dbFile: { path: 'explicit/path.txt', spaceId: 1, inTrash: false }
        }
        webDAVSpaces.spaceEnv.mockResolvedValue(explicitSpace)
        filesLockManager.getLockByToken.mockResolvedValue({
          options: { lockRoot: '/webdav/explicit' }
        } as any)
        const req = createBaseRequest({
          dav: {
            ...createBaseRequest().dav,
            ifHeaders: [
              {
                path: '/webdav/explicit/path.txt',
                token: { value: 'opaquelocktoken:xyz', mustMatch: true }
              }
            ]
          }
        })
        const res = createMockResponse()

        const result = await (service as any).evaluateIfHeaders(req, res)

        expect(webDAVSpaces.spaceEnv).toHaveBeenCalledWith(req.user, '/webdav/explicit/path.txt')
        expect(result).toBe(true)
      })
    })

    describe('etag condition', () => {
      it('should return true when etag matches', async () => {
        ;(isPathExists as jest.Mock).mockResolvedValue(true)
        ;(genEtag as jest.Mock).mockReturnValue('W/"etag-123"')
        const req = createBaseRequest({
          dav: {
            ...createBaseRequest().dav,
            ifHeaders: [{ etag: { value: 'W/"etag-123"', mustMatch: true } }]
          }
        })
        const res = createMockResponse()

        const result = await (service as any).evaluateIfHeaders(req, res)

        expect(result).toBe(true)
      })

      it('should return true when etag does not match and mustMatch=false', async () => {
        ;(isPathExists as jest.Mock).mockResolvedValue(true)
        ;(genEtag as jest.Mock).mockReturnValue('W/"etag-123"')
        const req = createBaseRequest({
          dav: {
            ...createBaseRequest().dav,
            ifHeaders: [{ etag: { value: 'W/"different"', mustMatch: false } }]
          }
        })
        const res = createMockResponse()

        const result = await (service as any).evaluateIfHeaders(req, res)

        expect(result).toBe(true)
      })

      it('should return false with 412 when etag mismatches', async () => {
        ;(isPathExists as jest.Mock).mockResolvedValue(true)
        ;(genEtag as jest.Mock).mockReturnValue('W/"etag-123"')
        const req = createBaseRequest({
          dav: {
            ...createBaseRequest().dav,
            ifHeaders: [{ etag: { value: 'W/"wrong-etag"', mustMatch: true } }]
          }
        })
        const res = createMockResponse()

        const result = await (service as any).evaluateIfHeaders(req, res)

        expect(result).toBe(false)
        expect(res.statusCode).toBe(HttpStatus.PRECONDITION_FAILED)
      })

      it('should return false with 412 when resource does not exist (null etag)', async () => {
        ;(isPathExists as jest.Mock).mockResolvedValue(false)
        const req = createBaseRequest({
          dav: {
            ...createBaseRequest().dav,
            ifHeaders: [{ etag: { value: 'W/"etag-123"', mustMatch: true } }]
          }
        })
        const res = createMockResponse()

        const result = await (service as any).evaluateIfHeaders(req, res)

        expect(result).toBe(false)
        expect(res.statusCode).toBe(HttpStatus.PRECONDITION_FAILED)
      })

      it('should cache etag for multiple conditions on same path', async () => {
        ;(isPathExists as jest.Mock).mockResolvedValue(true)
        ;(genEtag as jest.Mock).mockReturnValue('W/"etag-123"')
        const req = createBaseRequest({
          dav: {
            ...createBaseRequest().dav,
            ifHeaders: [{ etag: { value: 'W/"wrong1"', mustMatch: true } }, { etag: { value: 'W/"etag-123"', mustMatch: true } }]
          }
        })
        const res = createMockResponse()

        const result = await (service as any).evaluateIfHeaders(req, res)

        expect(result).toBe(true)
        expect(genEtag).toHaveBeenCalledTimes(1) // Cached
      })
    })

    describe('Multiple conditions', () => {
      it('should evaluate multiple conditions and return true if any matches', async () => {
        ;(isPathExists as jest.Mock).mockResolvedValue(true)
        ;(PathsUtils.dbFileFromSpace as jest.Mock).mockReturnValue({ path: 'file.txt', spaceId: 1 })
        filesLockManager.getLocksByPath.mockResolvedValue([])
        const req = createBaseRequest({
          dav: {
            ...createBaseRequest().dav,
            ifHeaders: [
              { haveLock: { mustMatch: true } }, // Will fail (no lock)
              { haveLock: { mustMatch: false } } // Will succeed (no lock)
            ]
          }
        })
        const res = createMockResponse()

        const result = await (service as any).evaluateIfHeaders(req, res)

        expect(result).toBe(true)
      })

      it('should return false with 412 when all conditions fail', async () => {
        ;(isPathExists as jest.Mock).mockResolvedValue(true)
        ;(genEtag as jest.Mock).mockReturnValue('W/"etag-123"')
        filesLockManager.getLockByToken.mockResolvedValue(null)
        const req = createBaseRequest({
          dav: {
            ...createBaseRequest().dav,
            ifHeaders: [
              { etag: { value: 'W/"wrong1"', mustMatch: true } },
              { etag: { value: 'W/"wrong2"', mustMatch: true } },
              { token: { value: 'opaquelocktoken:missing', mustMatch: true } }
            ]
          }
        })
        const res = createMockResponse()

        const result = await (service as any).evaluateIfHeaders(req, res)

        expect(result).toBe(false)
        expect(res.statusCode).toBe(HttpStatus.PRECONDITION_FAILED)
        expect(res.body).toBe('If header condition failed')
      })
    })
  })

  describe('lockRefresh (private method)', () => {
    describe('Parameter validation', () => {
      it('should return 400 when no if-headers present', async () => {
        const req = createBaseRequest({
          dav: { ...createBaseRequest().dav, body: undefined, ifHeaders: [] }
        })
        const res = createMockResponse()

        await (service as any).lockRefresh(req, res, 'file.txt')

        expect(res.statusCode).toBe(HttpStatus.BAD_REQUEST)
        expect(res.body).toContain('Expected a lock token')
      })

      it('should return 400 when more than one if-header present', async () => {
        const req = createBaseRequest({
          dav: {
            ...createBaseRequest().dav,
            body: undefined,
            ifHeaders: [{ token: { value: 'token1', mustMatch: true } }, { token: { value: 'token2', mustMatch: true } }]
          }
        })
        const res = createMockResponse()

        await (service as any).lockRefresh(req, res, 'file.txt')

        expect(res.statusCode).toBe(HttpStatus.BAD_REQUEST)
        expect(res.body).toContain('Expected a lock token')
      })

      it('should return 400 when token extraction fails', async () => {
        const req = createBaseRequest({
          dav: {
            ...createBaseRequest().dav,
            body: undefined,
            ifHeaders: [{ notAToken: true }]
          }
        })
        const res = createMockResponse()
        jest.spyOn(IfHeaderUtils, 'extractOneToken').mockImplementation(() => {
          throw new Error('No token found')
        })

        await (service as any).lockRefresh(req, res, 'file.txt')

        expect(res.statusCode).toBe(HttpStatus.BAD_REQUEST)
        expect(res.body).toContain('Unable to extract token')
      })
    })

    describe('Token validation', () => {
      it('should return 412 when token not found or does not match path', async () => {
        const req = createBaseRequest({
          dav: {
            ...createBaseRequest().dav,
            body: undefined,
            ifHeaders: [{ token: { value: 'opaquelocktoken:missing', mustMatch: true } }]
          }
        })
        const res = createMockResponse()
        jest.spyOn(IfHeaderUtils, 'extractOneToken').mockReturnValue('opaquelocktoken:missing')
        filesLockManager.isLockedWithToken.mockResolvedValue(null)

        await (service as any).lockRefresh(req, res, 'file.txt')

        expect(filesLockManager.isLockedWithToken).toHaveBeenCalledWith('opaquelocktoken:missing', 'file.txt')
        expect(res.statusCode).toBe(HttpStatus.PRECONDITION_FAILED)
      })

      it('should return 403 when lock owner is different user', async () => {
        const req = createBaseRequest({
          user: { id: 1, login: 'user1' },
          dav: {
            ...createBaseRequest().dav,
            body: undefined,
            ifHeaders: [{ token: { value: 'opaquelocktoken:abc', mustMatch: true } }]
          }
        })
        const res = createMockResponse()
        jest.spyOn(IfHeaderUtils, 'extractOneToken').mockReturnValue('opaquelocktoken:abc')
        filesLockManager.isLockedWithToken.mockResolvedValue({
          owner: { id: 999, login: 'other-user' }
        } as any)

        await (service as any).lockRefresh(req, res, 'file.txt')

        expect(res.statusCode).toBe(HttpStatus.FORBIDDEN)
        expect(res.body).toBe('Lock token does not match owner')
      })
    })

    describe('Successful refresh', () => {
      it('should refresh lock and return 200 with XML body', async () => {
        const req = createBaseRequest({
          dav: {
            ...createBaseRequest().dav,
            body: undefined,
            lock: { ...createBaseRequest().dav.lock, timeout: 180 },
            ifHeaders: [{ token: { value: 'opaquelocktoken:abc', mustMatch: true } }]
          }
        })
        const res = createMockResponse()
        const mockLock = {
          owner: { id: 1, login: 'test-user' },
          options: { lockRoot: '/webdav/test/file.txt', lockToken: 'opaquelocktoken:abc' }
        }
        jest.spyOn(IfHeaderUtils, 'extractOneToken').mockReturnValue('opaquelocktoken:abc')
        filesLockManager.isLockedWithToken.mockResolvedValue(mockLock as any)

        await (service as any).lockRefresh(req, res, 'file.txt')

        expect(filesLockManager.refreshLockTimeout).toHaveBeenCalledWith(mockLock, 180)
        expect(res.statusCode).toBe(HttpStatus.OK)
        expect(res.contentType).toContain('application/xml')
        expect(typeof res.body).toBe('string')
      })

      it('should use default timeout when not specified', async () => {
        const req = createBaseRequest({
          dav: {
            ...createBaseRequest().dav,
            body: undefined,
            lock: { ...createBaseRequest().dav.lock, timeout: undefined },
            ifHeaders: [{ token: { value: 'opaquelocktoken:abc', mustMatch: true } }]
          }
        })
        const res = createMockResponse()
        const mockLock = {
          owner: { id: 1, login: 'test-user' },
          options: { lockRoot: '/webdav/test/file.txt' }
        }
        jest.spyOn(IfHeaderUtils, 'extractOneToken').mockReturnValue('opaquelocktoken:abc')
        filesLockManager.isLockedWithToken.mockResolvedValue(mockLock as any)

        await (service as any).lockRefresh(req, res, 'file.txt')

        expect(filesLockManager.refreshLockTimeout).toHaveBeenCalledWith(mockLock, undefined)
      })
    })
  })

  describe('handleError (private method)', () => {
    describe('LockConflict errors', () => {
      it('should handle LockConflict with lockRoot', async () => {
        const lockError = new LockConflict(
          {
            dbFilePath: 'file.txt',
            options: { lockRoot: '/webdav/locked/resource' }
          } as any,
          'Lock conflict'
        )
        const req = createBaseRequest({ method: 'PUT' })
        const res = createMockResponse()

        const result = (service as any).handleError(req, res, lockError)

        expect(result).toBe(res)
        expect(res.statusCode).toBe(HttpStatus.LOCKED)
        expect(res.contentType).toContain('application/xml')
      })

      it('should handle LockConflict without lockRoot (fallback to dbFilePath)', async () => {
        const lockError = new LockConflict({ dbFilePath: 'file.txt' } as any, 'Lock conflict')
        const req = createBaseRequest({ method: 'DELETE' })
        const res = createMockResponse()

        const result = (service as any).handleError(req, res, lockError)

        expect(result).toBe(res)
        expect(res.statusCode).toBe(HttpStatus.LOCKED)
      })
    })

    describe('FileError errors', () => {
      it('should handle FileError and return correct status code', async () => {
        const fileError = new FileError(409, 'Conflict: file already exists')
        const req = createBaseRequest({ method: 'MKCOL' })
        const res = createMockResponse()

        const result = (service as any).handleError(req, res, fileError)

        expect(result).toBe(res)
        expect(res.statusCode).toBe(409)
        expect(res.body).toBe('Conflict: file already exists')
      })

      it('should strip additional error information after comma', async () => {
        const fileError = new FileError(404, 'File not found, /real/path/details')
        const req = createBaseRequest({ method: 'GET' })
        const res = createMockResponse()

        const result = (service as any).handleError(req, res, fileError)

        expect(result).toBe(res)
        expect(res.statusCode).toBe(404)
        expect(res.body).toBe('File not found')
      })
    })

    describe('Unexpected errors', () => {
      it('should throw HttpException for unexpected errors', () => {
        const unexpectedError = new Error('Database connection failed')
        const req = createBaseRequest({ method: 'PUT' })
        const res = createMockResponse()

        expect(() => {
          ;(service as any).handleError(req, res, unexpectedError)
        }).toThrow(HttpException)
      })

      it('should log error with method and URL', () => {
        const logSpy = jest.spyOn((service as any)['logger'], 'error').mockImplementation(() => undefined)
        const req = createBaseRequest({ method: 'PUT', dav: { ...createBaseRequest().dav, url: '/webdav/test.txt' } })
        const res = createMockResponse()
        const error = new Error('Test error')

        try {
          ;(service as any).handleError(req, res, error)
        } catch {
          // Expected to throw
        }

        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('PUT'))
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('/webdav/test.txt'))
      })

      it('should include destination URL in log when provided', () => {
        const logSpy = jest.spyOn((service as any)['logger'], 'error').mockImplementation(() => undefined)
        const req = createBaseRequest({ method: 'COPY' })
        const res = createMockResponse()
        const error = new Error('Copy error')

        try {
          ;(service as any).handleError(req, res, error, '/webdav/destination.txt')
        } catch {
          // Expected to throw
        }

        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(' -> /webdav/destination.txt'))
      })
    })
  })
})
