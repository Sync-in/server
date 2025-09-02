/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpException, HttpStatus } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { FilesLockManager } from '../../files/services/files-lock-manager.service'
import { FilesManager } from '../../files/services/files-manager.service'
import { dirName, isPathExists } from '../../files/utils/files'
import { SPACE_REPOSITORY } from '../../spaces/constants/spaces'
import * as PathsUtils from '../../spaces/utils/paths'
import { haveSpaceEnvPermissions } from '../../spaces/utils/permissions'
import { STANDARD_PROPS } from '../constants/webdav'
import * as IfHeaderUtils from '../utils/if-header'
import { WebDAVMethods } from './webdav-methods.service'
import { WebDAVSpaces } from './webdav-spaces.service'

jest.mock('../../files/utils/files', () => ({
  isPathExists: jest.fn(),
  dirName: jest.fn(),
  genEtag: jest.fn().mockReturnValue('W/"etag"')
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

describe(WebDAVMethods.name, () => {
  let service: WebDAVMethods
  let filesManager: {
    sendFileFromSpace: jest.Mock
    mkFile: jest.Mock
    saveStream: jest.Mock
    delete: jest.Mock
    touch: jest.Mock
    mkDir: jest.Mock
    copyMove: jest.Mock
  }
  let filesLockManager: {
    create: jest.Mock
    isLockedWithToken: jest.Mock
    removeLock: jest.Mock
    browseLocks: jest.Mock
    browseParentChildLocks: jest.Mock
    checkConflicts: jest.Mock
    getLocksByPath: jest.Mock
    getLockByToken: jest.Mock
    refreshLockTimeout: jest.Mock
  }
  let webDAVSpaces: { propfind: jest.Mock; spaceEnv: jest.Mock }
  const makeRes = () => {
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

  const baseReq = (overrides: Partial<any> = {}) =>
    ({
      method: 'GET',
      user: { id: 1, login: 'user-1' },
      dav: {
        url: '/webdav/url',
        depth: '0',
        httpVersion: 'HTTP/1.1',
        body: '<lockrequest/>',
        lock: { timeout: 60, lockscope: 'exclusive', owner: 'user-1', token: 'opaquetoken:abc' }
      },
      space: {
        id: 10,
        alias: 'spaceA',
        url: '/spaces/spaceA/file.txt',
        realPath: '/real/path/file.txt',
        inSharesList: false,
        dbFile: { path: 'file.txt' }
      },
      ...overrides
    }) as any

  beforeAll(async () => {
    filesManager = {
      sendFileFromSpace: jest.fn(),
      mkFile: jest.fn().mockResolvedValue(undefined),
      saveStream: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
      touch: jest.fn().mockResolvedValue(undefined),
      mkDir: jest.fn().mockResolvedValue(undefined),
      copyMove: jest.fn().mockResolvedValue(undefined)
    }
    filesLockManager = {
      create: jest.fn(),
      isLockedWithToken: jest.fn(),
      removeLock: jest.fn().mockResolvedValue(undefined),
      browseLocks: jest.fn(),
      browseParentChildLocks: jest.fn(),
      checkConflicts: jest.fn().mockResolvedValue(undefined),
      getLocksByPath: jest.fn(),
      getLockByToken: jest.fn(),
      refreshLockTimeout: jest.fn().mockResolvedValue(undefined)
    }
    webDAVSpaces = {
      propfind: jest.fn(),
      spaceEnv: jest.fn()
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebDAVMethods,
        { provide: WebDAVSpaces, useValue: webDAVSpaces },
        {
          provide: FilesManager,
          useValue: filesManager
        },
        { provide: FilesLockManager, useValue: filesLockManager }
      ]
    }).compile()

    module.useLogger(['fatal'])
    service = module.get<WebDAVMethods>(WebDAVMethods)
  })

  beforeEach(() => {
    jest.clearAllMocks()
    ;(isPathExists as jest.Mock).mockReset().mockResolvedValue(true)
    ;(dirName as jest.Mock).mockReturnValue('/real/path')
    ;(haveSpaceEnvPermissions as jest.Mock).mockReturnValue(true)
  })
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('headOrGet', () => {
    it('streams the file when repository is FILES and not in shares list', async () => {
      const req = baseReq()
      const res = makeRes()
      const streamable = { stream: 'ok' }
      const send = {
        checks: jest.fn().mockResolvedValue(undefined),
        stream: jest.fn().mockResolvedValue(streamable)
      }
      filesManager.sendFileFromSpace.mockReturnValue(send)

      const result = await service.headOrGet(req, res, SPACE_REPOSITORY.FILES)

      expect(filesManager.sendFileFromSpace).toHaveBeenCalledWith(req.space)
      expect(send.checks).toHaveBeenCalledTimes(1)
      expect(send.stream).toHaveBeenCalledWith(req, res)
      expect(result).toBe(streamable)
    })

    it('returns 403 when repository is not allowed', async () => {
      const req = baseReq({ space: { ...baseReq().space, inSharesList: true } })
      const res = makeRes()

      // repository not FILES or inSharesList true => forbidden
      await service.headOrGet(req, res, 'OTHER')

      expect(res.statusCode).toBe(HttpStatus.FORBIDDEN)
      expect(res.body).toBe('Not allowed on this resource')
    })

    it('handles error thrown by sendFile.checks via handleError', async () => {
      const req = baseReq()
      const res = makeRes()
      const send = {
        checks: jest.fn().mockRejectedValue(new Error('boom')),
        stream: jest.fn()
      }
      filesManager.sendFileFromSpace.mockReturnValue(send)
      const handleSpy = jest.spyOn<any, any>(service, 'handleError').mockReturnValue('handled')

      const result = await service.headOrGet(req, res, SPACE_REPOSITORY.FILES)

      expect(handleSpy).toHaveBeenCalled()
      expect(result).toBe('handled')
    })
  })

  describe('lock', () => {
    it('when body is empty: returns 400 if resource does not exist (lock refresh)', async () => {
      ;(isPathExists as jest.Mock).mockResolvedValue(false)
      const req = baseReq({ dav: { ...baseReq().dav, body: undefined } })
      const res = makeRes()

      await service.lock(req, res)

      expect(res.statusCode).toBe(HttpStatus.BAD_REQUEST)
      expect(res.body).toBe('Lock refresh must specify an existing resource')
    })

    it('when body is empty: delegates to lockRefresh if resource exists', async () => {
      ;(isPathExists as jest.Mock).mockResolvedValue(true)
      const req = baseReq({ dav: { ...baseReq().dav, body: undefined } })
      const res = makeRes()
      const lockRefreshSpy = jest.spyOn<any, any>(service, 'lockRefresh').mockResolvedValue('ok')

      const result = await service.lock(req, res)

      expect(lockRefreshSpy).toHaveBeenCalledWith(req, res, req.space.dbFile.path)
      expect(result).toBe('ok')
    })

    it('returns 403 when creating new lock on non-existing resource without permission', async () => {
      ;(isPathExists as jest.Mock).mockResolvedValueOnce(false) // resource does not exist
      ;(haveSpaceEnvPermissions as jest.Mock).mockReturnValue(false)
      const req = baseReq()
      const res = makeRes()

      await service.lock(req, res)

      expect(res.statusCode).toBe(HttpStatus.FORBIDDEN)
      expect(res.body).toBe('You are not allowed to do this action')
      expect(filesLockManager.create).not.toHaveBeenCalled()
    })

    it('returns 409 when parent does not exist for new lock', async () => {
      ;(isPathExists as jest.Mock)
        .mockResolvedValueOnce(false) // resource does not exist
        .mockResolvedValueOnce(false) // parent does not exist
      ;(haveSpaceEnvPermissions as jest.Mock).mockReturnValue(true)
      ;(dirName as jest.Mock).mockReturnValue('/real/path/parent-missing')
      const req = baseReq()
      const res = makeRes()

      await service.lock(req, res)

      expect(res.statusCode).toBe(HttpStatus.CONFLICT)
      expect(res.body).toBe('Parent must exists')
      expect(filesLockManager.create).not.toHaveBeenCalled()
    })

    it('creates lock on existing resource and returns 200 with lock-token header', async () => {
      ;(isPathExists as jest.Mock).mockResolvedValue(true) // resource exists
      const req = baseReq()
      const res = makeRes()

      filesLockManager.create.mockImplementation(async (_user, _dbFile, _depth, _timeout, davLock) => {
        davLock.locktoken = 'opaquetoken:1'
        return [
          true,
          {
            dbFilePath: _dbFile?.path,
            davLock: {
              lockroot: davLock.lockroot,
              locktoken: davLock.locktoken,
              lockscope: davLock.lockscope,
              owner: davLock.owner,
              depth: _depth,
              timeout: _timeout
            }
          }
        ] as any
      })

      await service.lock(req, res)

      expect(filesLockManager.create).toHaveBeenCalledTimes(1)
      expect(res.headers['lock-token']).toBe('<opaquetoken:1>')
      expect(res.statusCode).toBe(HttpStatus.OK)
      expect(res.contentType).toBe('application/xml; charset=utf-8')
      expect(res.body).toBeDefined()
    })

    it('creates lock on unmapped URL (resource missing), creates empty file and returns 201', async () => {
      ;(isPathExists as jest.Mock)
        .mockResolvedValueOnce(false) // resource missing
        .mockResolvedValueOnce(true) // parent exists
      const req = baseReq()
      const res = makeRes()

      filesLockManager.create.mockImplementation(async (_user, _dbFile, _depth, _timeout, davLock) => {
        davLock.locktoken = 'opaquetoken:new'
        return [
          true,
          {
            dbFilePath: _dbFile?.path,
            davLock: {
              lockroot: davLock.lockroot,
              locktoken: davLock.locktoken,
              lockscope: davLock.lockscope,
              owner: davLock.owner,
              depth: _depth,
              timeout: _timeout
            }
          }
        ] as any
      })

      await service.lock(req, res)

      expect(filesManager.mkFile).toHaveBeenCalledTimes(1)
      expect(res.statusCode).toBe(HttpStatus.CREATED)
      expect(res.headers['lock-token']).toBe('<opaquetoken:new>')
    })

    it('returns 423 when a lock conflict occurs', async () => {
      ;(isPathExists as jest.Mock).mockResolvedValue(true)
      const req = baseReq()
      const res = makeRes()

      filesLockManager.create.mockResolvedValue([false, { davLock: { lockroot: '/locked' }, dbFilePath: 'file.txt' }])

      await service.lock(req, res)

      // DAV_ERROR_RES should have set 423 on the response
      expect(res.statusCode).toBe(HttpStatus.LOCKED)
    })
  })

  describe('unlock', () => {
    it('returns 404 when resource does not exist', async () => {
      ;(isPathExists as jest.Mock).mockResolvedValue(false)
      const req = baseReq()
      const res = makeRes()

      await service.unlock(req, res)

      expect(res.statusCode).toBe(HttpStatus.NOT_FOUND)
      expect(res.body).toBe(req.dav.url)
    })

    it('returns 409 when lock token does not exist or does not match URL', async () => {
      ;(isPathExists as jest.Mock).mockResolvedValue(true)
      filesLockManager.isLockedWithToken.mockResolvedValue(null)
      const req = baseReq()
      const res = makeRes()

      await service.unlock(req, res)

      expect(filesLockManager.isLockedWithToken).toHaveBeenCalledWith(req.dav.lock.token, req.space.dbFile.path)
      expect(res.statusCode).toBe(HttpStatus.CONFLICT)
    })

    it('returns 403 when the lock owner is a different user', async () => {
      ;(isPathExists as jest.Mock).mockResolvedValue(true)
      filesLockManager.isLockedWithToken.mockResolvedValue({ owner: { id: 2 }, key: 'k1' })
      const req = baseReq()
      const res = makeRes()

      await service.unlock(req, res)

      expect(res.statusCode).toBe(HttpStatus.FORBIDDEN)
      expect(res.body).toBe('Token was created by another user')
      expect(filesLockManager.removeLock).not.toHaveBeenCalled()
    })

    it('removes lock and returns 204 when owner matches', async () => {
      ;(isPathExists as jest.Mock).mockResolvedValue(true)
      filesLockManager.isLockedWithToken.mockResolvedValue({ owner: { id: 1 }, key: 'k2' })
      const req = baseReq()
      const res = makeRes()

      await service.unlock(req, res)

      expect(filesLockManager.removeLock).toHaveBeenCalledWith('k2')
      expect(res.statusCode).toBe(HttpStatus.NO_CONTENT)
    })
  })

  describe('propfind', () => {
    it('returns 404 when repository is FILES and path does not exist', async () => {
      ;(isPathExists as jest.Mock).mockResolvedValue(false)
      const req = baseReq({ dav: { ...baseReq().dav, propfindMode: 'prop' } })
      const res = makeRes()

      const result = await service.propfind(req, res, SPACE_REPOSITORY.FILES)

      expect(result).toBe(res)
      expect(res.statusCode).toBe(HttpStatus.NOT_FOUND)
      expect(res.body).toBe(req.dav.url)
    })

    it('returns multistatus with only property names when PROPNAME mode', async () => {
      ;(isPathExists as jest.Mock).mockResolvedValue(true)
      const req = baseReq({ dav: { ...baseReq().dav, propfindMode: 'propname', httpVersion: 'HTTP/1.1' } })
      const res = makeRes()
      const handler = (service as any)['webDAVHandler']
      jest.spyOn(handler, 'propfind').mockImplementation(async function* () {
        yield { href: '/a', name: 'file.txt' }
      })

      const result = await service.propfind(req, res, SPACE_REPOSITORY.FILES)

      expect(result).toBe(res)
      expect(res.statusCode).toBe(HttpStatus.MULTI_STATUS)
      expect(res.contentType).toContain('application/xml')
      expect(typeof res.body).toBe('string')
      expect(res.body).toContain('/a')
    })

    it('collects lock discovery based on depth', async () => {
      ;(isPathExists as jest.Mock).mockResolvedValue(true)
      const req0 = baseReq({
        dav: {
          ...baseReq().dav,
          body: { propfind: { prop: { [STANDARD_PROPS[0]]: '' } } },
          propfindMode: 'prop',
          httpVersion: 'HTTP/1.1',
          depth: '0'
        }
      })
      const reqInf = baseReq({
        dav: {
          ...baseReq().dav,
          body: { propfind: { prop: { [STANDARD_PROPS[0]]: '' } } },
          propfindMode: 'prop',
          httpVersion: 'HTTP/1.1',
          depth: 'infinity'
        }
      })
      const res0 = makeRes()
      const resInf = makeRes()
      const handler = (service as any)['webDAVHandler']
      jest.spyOn(handler, 'propfind').mockImplementation(async function* () {
        yield { href: '/a', name: 'file.txt', getlastmodified: 'x' }
      })
      filesLockManager.browseLocks.mockResolvedValue({ 'file.txt': { davLock: { lockroot: '/dav/url' } } })
      await service.propfind(req0, res0 as any, SPACE_REPOSITORY.FILES)
      expect(filesLockManager.browseLocks).toHaveBeenCalledTimes(1)

      filesLockManager.browseParentChildLocks.mockResolvedValue({ 'file.txt': { davLock: { lockroot: '/dav/url' } } })
      await service.propfind(reqInf, resInf as any, SPACE_REPOSITORY.FILES)
      expect(filesLockManager.browseParentChildLocks).toHaveBeenCalledTimes(1)
    })

    it('includes lockdiscovery when requested', async () => {
      ;(isPathExists as jest.Mock).mockResolvedValue(true)
      const req = baseReq({
        dav: {
          ...baseReq().dav,
          propfindMode: 'prop',
          httpVersion: 'HTTP/1.1',
          body: { propfind: { prop: { lockdiscovery: '' } } }
        }
      })
      const res = makeRes()
      const handler = (service as any)['webDAVHandler']
      jest.spyOn(handler, 'propfind').mockImplementation(async function* () {
        yield { href: '/a', name: 'file.txt' }
      })
      filesLockManager.browseLocks.mockResolvedValue({ 'file.txt': { davLock: { lockroot: '/dav/url' } } })

      await service.propfind(req, res as any, SPACE_REPOSITORY.FILES)

      expect(res.statusCode).toBe(HttpStatus.MULTI_STATUS)
      expect(typeof res.body).toBe('string')
      expect(res.body).toContain('/dav/url')
    })
  })

  describe('put', () => {
    it.each([
      { existed: true, expected: HttpStatus.NO_CONTENT, checkEtag: true },
      { existed: false, expected: HttpStatus.CREATED, checkEtag: false }
    ])('returns correct status for PUT when existed=%s', async ({ existed, expected, checkEtag }) => {
      filesManager.saveStream.mockResolvedValue(existed)
      const req = baseReq({ method: 'PUT' })
      const res = makeRes()

      const result = await service.put(req, res)

      if (checkEtag) {
        expect(res.headers['etag']).toBeDefined()
        expect(result).toBe(res)
      }
      expect(res.statusCode).toBe(expected)
    })

    it('delegates errors to handleError', async () => {
      const req = baseReq({ method: 'PUT' })
      const res = makeRes()
      const err = new Error('save failed')
      filesManager.saveStream.mockRejectedValue(err)
      const spy = jest.spyOn<any, any>(service as any, 'handleError').mockReturnValue('handled')

      const result = await service.put(req, res)

      expect(spy).toHaveBeenCalled()
      expect(result).toBe('handled')
    })
  })

  describe('delete', () => {
    it('returns 204 on success', async () => {
      const req = baseReq({ method: 'DELETE' })
      const res = makeRes()

      const result = await service.delete(req, res)

      expect(result).toBe(res)
      expect(res.statusCode).toBe(HttpStatus.NO_CONTENT)
    })

    it('delegates errors to handleError', async () => {
      const req = baseReq({ method: 'DELETE' })
      const res = makeRes()
      const err = new Error('delete failed')
      filesManager.delete.mockRejectedValue(err)
      const spy = jest.spyOn<any, any>(service as any, 'handleError').mockReturnValue('handled')

      const result = await service.delete(req, res)

      expect(spy).toHaveBeenCalled()
      expect(result).toBe('handled')
    })
  })

  describe('proppatch', () => {
    it('returns 404 when target does not exist', async () => {
      ;(isPathExists as jest.Mock).mockResolvedValue(false)
      const req = baseReq({ method: 'PROPPATCH', dav: { ...baseReq().dav, url: '/x', body: { propertyupdate: {} } } })
      const res = makeRes()

      await service.proppatch(req, res)

      expect(res.statusCode).toBe(HttpStatus.NOT_FOUND)
      expect(res.body).toBe('/x')
    })

    it('returns 400 for unknown action tag', async () => {
      ;(isPathExists as jest.Mock).mockResolvedValue(true)
      const req = baseReq({ method: 'PROPPATCH', dav: { ...baseReq().dav, body: { propertyupdate: { unknown: {} } } } })
      const res = makeRes()

      await service.proppatch(req, res)

      expect(res.statusCode).toBe(HttpStatus.BAD_REQUEST)
      expect(res.body).toContain('Unknown tag')
    })

    it('returns 400 when missing prop tag', async () => {
      ;(isPathExists as jest.Mock).mockResolvedValue(true)
      const req = baseReq({ method: 'PROPPATCH', dav: { ...baseReq().dav, body: { propertyupdate: { set: { foo: 'bar' } } } } })
      const res = makeRes()

      await service.proppatch(req, res)

      expect(res.statusCode).toBe(HttpStatus.BAD_REQUEST)
      expect(res.body).toContain('Unknown tag')
    })

    it('returns 207 with errors when unsupported props are provided', async () => {
      ;(isPathExists as jest.Mock).mockResolvedValue(true)
      filesLockManager.checkConflicts.mockResolvedValue(undefined)
      const req = baseReq({
        method: 'PROPPATCH',
        dav: {
          ...baseReq().dav,
          httpVersion: 'HTTP/1.1',
          body: { propertyupdate: { set: { prop: [{ randomProp: 'x' }] } } }
        }
      })
      const res = makeRes()

      await service.proppatch(req, res)

      expect(res.statusCode).toBe(HttpStatus.MULTI_STATUS)
      expect(res.contentType).toContain('application/xml')
      expect(typeof res.body).toBe('string')
      expect(res.body).toContain('randomProp')
      expect(res.body).toContain('403')
    })

    it('applies modified props and still returns 207; failed dependency if one fails', async () => {
      ;(isPathExists as jest.Mock).mockResolvedValue(true)
      filesLockManager.checkConflicts.mockResolvedValue(undefined)
      filesManager.touch.mockResolvedValueOnce(undefined)
      const req = baseReq({
        method: 'PROPPATCH',
        dav: {
          ...baseReq().dav,
          httpVersion: 'HTTP/1.1',
          body: { propertyupdate: { set: { prop: [{ lastmodified: '2024-01-01' }, { ['Win32CreationTime']: 'keep' }] } } }
        }
      })
      const res = makeRes()

      await service.proppatch(req, res)

      expect(filesManager.touch).toHaveBeenCalled()
      expect(res.statusCode).toBe(HttpStatus.MULTI_STATUS)
      expect(typeof res.body).toBe('string')
      expect(res.body).toContain('lastmodified')
      expect(res.body).toContain('200')
    })

    it('delegates lock conflict to handleError when checkConflicts throws', async () => {
      ;(isPathExists as jest.Mock).mockResolvedValue(true)
      const req = baseReq({ method: 'PROPPATCH', dav: { ...baseReq().dav, body: { propertyupdate: { set: { prop: [{ lastmodified: 'x' }] } } } } })
      const res = makeRes()
      const err = new Error('conflict')
      filesLockManager.checkConflicts.mockRejectedValue(err)
      const spy = jest.spyOn<any, any>(service as any, 'handleError').mockReturnValue('handled')

      const result = await service.proppatch(req, res)

      expect(spy).toHaveBeenCalled()
      expect(result).toBe('handled')
    })

    it('normalizes array of propertyupdate items containing {prop: ...}', async () => {
      ;(isPathExists as jest.Mock).mockResolvedValue(true)
      filesLockManager.checkConflicts.mockResolvedValue(undefined)
      filesManager.touch.mockResolvedValueOnce(undefined)
      const req = baseReq({
        method: 'PROPPATCH',
        dav: {
          ...baseReq().dav,
          httpVersion: 'HTTP/1.1',
          body: {
            propertyupdate: {
              set: [{ prop: { lastmodified: '2024-03-01' } }, { prop: { ['Win32CreationTime']: 'ignore' } }]
            }
          }
        }
      })
      const res = makeRes()

      await service.proppatch(req, res)

      expect(filesManager.touch).toHaveBeenCalled()
      expect(res.statusCode).toBe(HttpStatus.MULTI_STATUS)
      expect(res.contentType).toContain('application/xml')
      expect(typeof res.body).toBe('string')
      expect(res.body).toContain('lastmodified')
      expect(res.body).toContain('200')
    })

    it('wraps single prop object into an array for processing', async () => {
      ;(isPathExists as jest.Mock).mockResolvedValue(true)
      filesLockManager.checkConflicts.mockResolvedValue(undefined)
      const req = baseReq({
        method: 'PROPPATCH',
        dav: {
          ...baseReq().dav,
          httpVersion: 'HTTP/1.1',
          body: {
            propertyupdate: {
              set: {
                prop: { lastmodified: '2024-03-02' }
              }
            }
          }
        }
      })
      const res = makeRes()

      await service.proppatch(req, res)

      expect(filesManager.touch).toHaveBeenCalled()
      expect(res.statusCode).toBe(HttpStatus.MULTI_STATUS)
      expect(typeof res.body).toBe('string')
      expect(res.body).toContain('lastmodified')
      expect(res.body).toContain('200')
    })

    it('handles REMOVE action on supported property and returns 207', async () => {
      ;(isPathExists as jest.Mock).mockResolvedValue(true)
      filesLockManager.checkConflicts.mockResolvedValue(undefined)
      const req = baseReq({
        method: 'PROPPATCH',
        dav: {
          ...baseReq().dav,
          httpVersion: 'HTTP/1.1',
          body: {
            propertyupdate: {
              remove: {
                prop: [{ ['Win32CreationTime']: '' }]
              }
            }
          }
        }
      })
      const res = makeRes()

      await service.proppatch(req, res)

      expect(filesManager.touch).not.toHaveBeenCalled()
      expect(res.statusCode).toBe(HttpStatus.MULTI_STATUS)
      expect(res.contentType).toContain('application/xml')
      expect(typeof res.body).toBe('string')
      expect(res.body).toContain('Win32CreationTime')
      expect(res.body).toContain('200')
    })

    it('returns 207 with 424 Failed Dependency when touching lastmodified fails', async () => {
      ;(isPathExists as jest.Mock).mockResolvedValue(true)
      filesLockManager.checkConflicts.mockResolvedValue(undefined)
      filesManager.touch.mockRejectedValueOnce(new Error('touch failed'))
      const req = baseReq({
        method: 'PROPPATCH',
        dav: {
          ...baseReq().dav,
          httpVersion: 'HTTP/1.1',
          body: { propertyupdate: { set: { prop: [{ lastmodified: '2024-01-01' }, { ['Win32CreationTime']: 'ok' }] } } }
        }
      })
      const res = makeRes()

      await service.proppatch(req, res)

      expect(res.statusCode).toBe(HttpStatus.MULTI_STATUS)
      expect(typeof res.body).toBe('string')
      expect(res.body).toContain('424')
      expect(res.body).toContain('lastmodified')
    })

    it('returns 207 with 403 for unsupported prop and 424 for supported prop as failed dependency', async () => {
      // Préparation : la ressource existe et pas de conflit de lock
      ;(isPathExists as jest.Mock).mockResolvedValue(true)
      filesLockManager.checkConflicts.mockResolvedValue(undefined)

      // On envoie à la fois une prop non supportée ('randomProp') et une prop supportée ('Win32CreationTime')
      const req = baseReq({
        method: 'PROPPATCH',
        dav: {
          ...baseReq().dav,
          httpVersion: 'HTTP/1.1',
          body: {
            propertyupdate: {
              set: {
                prop: [{ randomProp: 'x' }, { Win32CreationTime: 'keep' }]
              }
            }
          }
        }
      })
      const res = makeRes()

      // Exécution
      await service.proppatch(req, res)

      // Assertions : multistatus, xml, et contenu
      expect(res.statusCode).toBe(HttpStatus.MULTI_STATUS)
      expect(res.contentType).toContain('application/xml')
      const xml = res.body as string
      // On doit trouver le nom de la prop non supportée avec status 403
      expect(xml).toContain('randomProp')
      expect(xml).toContain('403')
      // On doit trouver le nom de la prop supportée avec status 424 (failed dependency)
      expect(xml).toContain('Win32CreationTime')
      expect(xml).toContain('424')
    })
  })

  describe('mkcol', () => {
    it('returns 201 when directory created', async () => {
      const req = baseReq({ method: 'MKCOL' })
      const res = makeRes()

      await service.mkcol(req, res)

      expect(filesManager.mkDir).toHaveBeenCalled()
      expect(res.statusCode).toBe(HttpStatus.CREATED)
    })

    it('delegates errors to handleError', async () => {
      const req = baseReq({ method: 'MKCOL' })
      const res = makeRes()
      filesManager.mkDir.mockRejectedValue(new Error('mkdir failed'))
      const spy = jest.spyOn<any, any>(service as any, 'handleError').mockReturnValue('handled')

      const result = await service.mkcol(req, res)

      expect(spy).toHaveBeenCalled()
      expect(result).toBe('handled')
    })
  })

  describe('copyMove', () => {
    it('returns 404 when destination space not found', async () => {
      const req = baseReq({ method: 'MOVE', dav: { ...baseReq().dav, copyMove: { destination: '/unknown', isMove: false, overwrite: false } } })
      const res = makeRes()
      const handler = (service as any)['webDAVHandler']
      jest.spyOn(handler, 'spaceEnv').mockResolvedValue(null)

      await service.copyMove(req, res)

      expect(res.statusCode).toBe(HttpStatus.NOT_FOUND)
      expect(res.body).toBe('/unknown')
    })

    it('aborts when evaluateIfHeaders fails', async () => {
      const req = baseReq({
        method: 'COPY',
        dav: {
          ...baseReq().dav,
          copyMove: { destination: '/dst', isMove: false, overwrite: true },
          ifHeaders: [{ path: '/dst', token: { value: 'bad', mustMatch: true } }]
        }
      })
      const res = makeRes()
      const handler = (service as any)['webDAVHandler']
      jest.spyOn(handler, 'spaceEnv').mockResolvedValue({ ...req.space, url: '/dst', realPath: '/real/dst', dbFile: { path: 'dst' } })
      const spy = jest.spyOn<any, any>(service as any, 'evaluateIfHeaders').mockResolvedValue(false)

      const result = await service.copyMove(req, res)

      expect(spy).toHaveBeenCalled()
      expect(result).toBeUndefined()
    })

    it('aborts with 412 when destination If-Header haveLock mismatches', async () => {
      const handler = (service as any)['webDAVHandler']
      const dstSpace = { ...baseReq().space, url: '/dst', realPath: '/real/dst', dbFile: { path: 'dst' } }
      jest.spyOn(handler, 'spaceEnv').mockResolvedValue(dstSpace)
      ;(isPathExists as jest.Mock).mockResolvedValue(true)
      filesLockManager.getLocksByPath.mockResolvedValue([{}]) // there is a lock, but mustMatch=false -> mismatch

      const req = baseReq({
        method: 'COPY',
        dav: {
          ...baseReq().dav,
          copyMove: { destination: '/dst', isMove: false, overwrite: true },
          ifHeaders: [{ path: '/dst', haveLock: { mustMatch: false } }]
        }
      })
      const res = makeRes()

      const result = await service.copyMove(req, res)

      expect(result).toBeUndefined()
      expect(res.statusCode).toBe(HttpStatus.PRECONDITION_FAILED)
      expect(res.body).toBe('If header condition failed')
    })

    it('returns 204 when destination existed; 201 when not', async () => {
      const handler = (service as any)['webDAVHandler']
      jest.spyOn(handler, 'spaceEnv').mockResolvedValue({ ...baseReq().space, url: '/dst', realPath: '/real/dst', dbFile: { path: 'dst' } })
      jest.spyOn<any, any>(service as any, 'evaluateIfHeaders').mockResolvedValue(true)
      ;(isPathExists as jest.Mock).mockResolvedValueOnce(true)
      const req1 = baseReq({ method: 'MOVE', dav: { ...baseReq().dav, copyMove: { destination: '/dst', isMove: true, overwrite: true } } })
      const res1 = makeRes()
      await service.copyMove(req1, res1 as any)
      expect(res1.statusCode).toBe(HttpStatus.NO_CONTENT)
      ;(isPathExists as jest.Mock).mockResolvedValueOnce(false)
      const req2 = baseReq({ method: 'COPY', dav: { ...baseReq().dav, copyMove: { destination: '/dst', isMove: false, overwrite: false } } })
      const res2 = makeRes()
      await service.copyMove(req2, res2 as any)
      expect(res2.statusCode).toBe(HttpStatus.CREATED)
    })

    it('delegates errors to handleError', async () => {
      const handler = (service as any)['webDAVHandler']
      jest.spyOn(handler, 'spaceEnv').mockResolvedValue({ ...baseReq().space, url: '/dst', realPath: '/real/dst', dbFile: { path: 'dst' } })
      jest.spyOn<any, any>(service as any, 'evaluateIfHeaders').mockResolvedValue(true)

      // Chain 1) LockConflict without lockroot (fallback to dbFilePath) then 2) unexpected error
      const { LockConflict } = jest.requireActual('../../files/models/file-lock-error')
      filesManager.copyMove.mockRejectedValueOnce(new LockConflict({ dbFilePath: 'dst' } as any)).mockRejectedValueOnce(new Error('copy failed'))

      const req = baseReq({ method: 'COPY', dav: { ...baseReq().dav, copyMove: { destination: '/dst', isMove: false, overwrite: true } } })

      // 1) LockConflict => DAV_ERROR_RES(423) using e.lock.dbFilePath
      const res1 = makeRes()
      const logSpy = jest.spyOn((service as any)['logger'], 'error').mockImplementation(() => undefined as any)
      const result1 = await service.copyMove(req, res1)

      expect(result1).toBe(res1)
      expect(res1.statusCode).toBe(HttpStatus.LOCKED)

      // 2) Unexpected error => HttpException 500 and log contains " -> /dst"
      const res2 = makeRes()
      try {
        await service.copyMove(req, res2)
        expect(true).toBe(false) // should not reach
      } catch (e: any) {
        expect(e).toBeInstanceOf(HttpException)
        expect(e.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR)
      }

      // Verify the log message includes an arrow to the destination (toUrl)
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(' -> /dst'))
    })

    it('returns early when evaluateIfHeaders returns false (explicit spy)', async () => {
      const req = baseReq({
        method: 'COPY',
        dav: {
          ...baseReq().dav,
          copyMove: { destination: '/dst', isMove: false, overwrite: true },
          ifHeaders: [{ path: '/dst' }]
        }
      })
      const res = makeRes()
      const handler = (service as any)['webDAVHandler']
      // Ensure destination space resolves so we reach the evaluateIfHeaders call
      jest.spyOn(handler, 'spaceEnv').mockResolvedValue({ ...req.space, url: '/dst', realPath: '/real/dst', dbFile: { path: 'dst' } })
      ;(isPathExists as jest.Mock).mockResolvedValue(true)
      // Decorator is no-op (mocked), so copyMove calls evaluateIfHeaders once for destination: force it to return false
      const spy = jest.spyOn<any, any>(service as any, 'evaluateIfHeaders').mockResolvedValue(false)

      const result = await service.copyMove(req, res as any)

      expect(spy).toHaveBeenCalledTimes(1)
      expect(result).toBeUndefined()
      expect(filesManager.copyMove).not.toHaveBeenCalled()
    })
  })

  describe('evaluateIfHeaders', () => {
    it('returns true when no headers', async () => {
      const req = baseReq({ dav: { ...baseReq().dav, ifHeaders: undefined } })
      const res = makeRes()

      const ok = await (service as any).evaluateIfHeaders(req, res)

      expect(ok).toBe(true)
    })

    const negativeIfHeaderCases = [
      {
        name: 'haveLock mismatch',
        dav: { ifHeaders: [{ haveLock: { mustMatch: true } }] },
        setup: async () => {
          // No lock present => match=false, mustMatch=true => mismatch
          ;(PathsUtils.dbFileFromSpace as unknown as jest.Mock).mockReturnValue({ path: 'file.txt', spaceId: 1, inTrash: false })
          filesLockManager.getLocksByPath.mockResolvedValue([])
        }
      },
      {
        name: 'haveLock mismatch when locks exist but mustMatch=false',
        dav: { ifHeaders: [{ haveLock: { mustMatch: false } }] },
        setup: async () => {
          // Lock present => match=true, mustMatch=false => mismatch
          ;(PathsUtils.dbFileFromSpace as unknown as jest.Mock).mockReturnValue({ path: 'dst', spaceId: 1, inTrash: false })
          filesLockManager.getLocksByPath.mockResolvedValue([{}])
        }
      },
      {
        name: 'token not found',
        dav: { ifHeaders: [{ token: { value: 'missing', mustMatch: true } }] },
        setup: async () => {
          filesLockManager.getLockByToken.mockResolvedValue(null)
        }
      },
      {
        name: 'etag mismatch',
        dav: { ifHeaders: [{ etag: { value: 'W/"bad"', mustMatch: true } }] },
        setup: async () => {
          ;(isPathExists as jest.Mock).mockResolvedValue(true)
        }
      }
    ] as const

    it.each(negativeIfHeaderCases)('fails with 412 on %s', async ({ dav, setup }) => {
      await setup()
      const req = baseReq({ dav: { ...baseReq().dav, ...dav } })
      const res = makeRes()

      const ok = await (service as any).evaluateIfHeaders(req, res)

      expect(ok).toBe(false)
      expect(res.statusCode).toBe(HttpStatus.PRECONDITION_FAILED)
    })

    it('returns true when one condition matches', async () => {
      ;(isPathExists as jest.Mock).mockResolvedValue(true)
      const req = baseReq({
        dav: {
          ...baseReq().dav,
          ifHeaders: [
            { etag: { value: 'W/"bad"', mustMatch: true } },
            { etag: { value: 'W/"etag"', mustMatch: true } } // this should pass
          ]
        }
      })
      const res = makeRes()

      const ok = await (service as any).evaluateIfHeaders(req, res)

      expect(ok).toBe(true)
      expect(res.statusCode).toBeUndefined()
    })

    it('fails with 412 on token url mismatch', async () => {
      const req = baseReq({
        dav: {
          ...baseReq().dav,
          ifHeaders: [{ path: '/dav/other', token: { value: 'opaquetoken:xyz', mustMatch: true } }]
        }
      })
      const res = makeRes()
      // Space for the explicit path
      const handler = (service as any)['webDAVHandler']
      jest.spyOn(handler, 'spaceEnv').mockResolvedValue({ ...req.space, url: '/dav/other', realPath: '/real/other', dbFile: { path: 'other' } })
      filesLockManager.getLockByToken.mockResolvedValue({ davLock: { lockroot: '/dav/url' } }) // not a parent of /dav/other

      const ok = await (service as any).evaluateIfHeaders(req, res)

      expect(ok).toBe(false)
      expect(res.statusCode).toBe(HttpStatus.PRECONDITION_FAILED)
    })

    it('fails with 412 and logs error when haveLock lookup throws', async () => {
      const req = baseReq({
        dav: {
          ...baseReq().dav,
          ifHeaders: [{ path: '/dav/url', haveLock: { mustMatch: true } }]
        }
      })
      const res = makeRes()
      const handler = (service as any)['webDAVHandler']
      jest.spyOn(handler, 'spaceEnv').mockResolvedValue(req.space)
      filesLockManager.getLocksByPath.mockRejectedValue(new Error('boom'))

      const ok = await (service as any).evaluateIfHeaders(req, res)

      expect(ok).toBe(false)
      expect(res.statusCode).toBe(HttpStatus.PRECONDITION_FAILED)
      expect(res.body).toBe('If header condition failed')
    })

    it('returns true when token exists and path matches lockroot', async () => {
      const req = baseReq({
        dav: {
          ...baseReq().dav,
          ifHeaders: [{ path: '/dav/url', token: { value: 'opaquetoken:good', mustMatch: true } }]
        }
      })
      const res = makeRes()
      const handler = (service as any)['webDAVHandler']
      jest.spyOn(handler, 'spaceEnv').mockResolvedValue(req.space)
      filesLockManager.getLockByToken.mockResolvedValue({ davLock: { lockroot: '/dav/url' } })

      const ok = await (service as any).evaluateIfHeaders(req, res)

      expect(ok).toBe(true)
      expect(res.statusCode).toBeUndefined()
    })

    it('returns false without setting status when If-Header path cannot be resolved', async () => {
      const req = baseReq({
        dav: {
          ...baseReq().dav,
          ifHeaders: [{ path: '/dav/missing' }]
        }
      })
      const res = makeRes()
      const handler = (service as any)['webDAVHandler']
      jest.spyOn(handler, 'spaceEnv').mockResolvedValue(null)

      const ok = await (service as any).evaluateIfHeaders(req, res)

      expect(ok).toBe(false)
      expect(res.statusCode).toBeUndefined()
      expect(res.body).toBeUndefined()
    })

    it('fails with 412 on etag when resource does not exist (null etag)', async () => {
      ;(isPathExists as jest.Mock).mockResolvedValue(false)
      const req = baseReq({
        dav: {
          ...baseReq().dav,
          ifHeaders: [{ etag: { value: 'W/"etag"', mustMatch: true } }]
        }
      })
      const res = makeRes()

      const ok = await (service as any).evaluateIfHeaders(req, res)

      expect(ok).toBe(false)
      expect(res.statusCode).toBe(HttpStatus.PRECONDITION_FAILED)
    })
  })

  describe('lockRefresh', () => {
    const refresh400Cases = [
      {
        name: 'more than one or zero tokens in If header',
        dav: { body: undefined, ifHeaders: [] },
        expectMsg: 'Expected a lock token'
      },
      {
        name: 'token extraction fails',
        dav: { body: undefined, ifHeaders: [{ notAToken: true }] },
        expectMsg: 'Unable to extract token'
      }
    ] as const

    it.each(refresh400Cases)('returns 400 when %s', async ({ dav, expectMsg }) => {
      const req = baseReq({ dav: { ...baseReq().dav, ...dav } })
      const res = makeRes()

      await (service as any).lockRefresh(req, res, req.space.dbFile.path)

      expect(res.statusCode).toBe(HttpStatus.BAD_REQUEST)
      expect(res.body).toContain(expectMsg)
    })

    it('returns 412 when token not found or not matching URL', async () => {
      const req = baseReq({
        dav: { ...baseReq().dav, body: undefined, ifHeaders: [{ token: { value: 'opaquetoken:missing', mustMatch: true } }] }
      })
      const res = makeRes()
      filesLockManager.isLockedWithToken.mockResolvedValue(null)
      jest.spyOn(IfHeaderUtils, 'extractOneToken').mockReturnValue('opaquetoken:missing')

      await (service as any).lockRefresh(req, res, req.space.dbFile.path)

      expect(res.statusCode).toBe(HttpStatus.PRECONDITION_FAILED)
    })

    it('returns 403 when owner mismatch', async () => {
      const req = baseReq({
        dav: { ...baseReq().dav, body: undefined, ifHeaders: [{ token: { value: 'opaquetoken:abc', mustMatch: true } }] }
      })
      const res = makeRes()
      jest.spyOn(IfHeaderUtils, 'extractOneToken').mockReturnValue('opaquetoken:abc')
      filesLockManager.isLockedWithToken.mockResolvedValue({ owner: { id: 2 } })

      await (service as any).lockRefresh(req, res, baseReq().space.dbFile.path)

      expect(res.statusCode).toBe(HttpStatus.FORBIDDEN)
      expect(res.body).toBe('Lock token does not match owner')
    })

    it('returns 200 and XML body on success', async () => {
      const req = baseReq({
        dav: {
          ...baseReq().dav,
          body: undefined,
          lock: { ...baseReq().dav.lock, timeout: 120 },
          ifHeaders: [{ token: { value: 'opaquetoken:abc', mustMatch: true } }]
        }
      })
      const res = makeRes()
      jest.spyOn(IfHeaderUtils, 'extractOneToken').mockReturnValue('opaquetoken:abc')
      filesLockManager.isLockedWithToken.mockResolvedValue({ owner: { id: 1 }, davLock: { lockroot: '/dav/url' } })

      await (service as any).lockRefresh(req, res, req.space.dbFile.path)

      expect(filesLockManager.refreshLockTimeout).toHaveBeenCalled()
      expect(res.statusCode).toBe(HttpStatus.OK)
      expect(res.contentType).toContain('application/xml')
      expect(typeof res.body).toBe('string')
    })
  })

  describe('handleError integration', () => {
    it('maps LockConflict to 423 Locked via DAV_ERROR_RES', async () => {
      // simulate LockConflict during PUT
      const { LockConflict } = jest.requireActual('../../files/models/file-lock-error')
      filesManager.saveStream.mockRejectedValue(new LockConflict({ dbFilePath: 'file.txt', davLock: { lockroot: '/dav/url' } } as any))

      const req = baseReq({ method: 'PUT' })
      const res = makeRes()

      const result = await service.put(req, res)

      expect(result).toBe(res)
      expect(res.statusCode).toBe(HttpStatus.LOCKED)
      expect(typeof res.body).toBe('string')
    })

    it('maps FileError to its httpCode and message', async () => {
      const { FileError } = jest.requireActual('../../files/models/file-error')
      filesManager.delete.mockRejectedValue(new FileError(409, 'conflict happened'))

      const req = baseReq({ method: 'DELETE' })
      const res = makeRes()

      const result = await service.delete(req, res)

      expect(result).toBe(res)
      expect(res.statusCode).toBe(409)
      expect(res.body).toBe('conflict happened')
    })

    it('throws 500 HttpException for unexpected errors', async () => {
      const req = baseReq({ method: 'PUT' })
      const res = makeRes()
      filesManager.saveStream.mockRejectedValue(new Error('unexpected'))

      try {
        await service.put(req, res)
        // If we reach this line, the test should fail
        expect(true).toBe(false)
      } catch (e: any) {
        expect(e).toBeInstanceOf(HttpException)
        expect(e.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR)
      }
    })
  })
})
