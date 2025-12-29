/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpService } from '@nestjs/axios'
import { HttpException, HttpStatus } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test, TestingModule } from '@nestjs/testing'
import { AxiosResponse } from 'axios'
import { Readable } from 'stream'
import { Cache } from '../../../../infrastructure/cache/services/cache.service'
import { ContextManager } from '../../../../infrastructure/context/services/context-manager.service'
import type { SpaceEnv } from '../../../spaces/models/space-env.model'
import type { UserModel } from '../../../users/models/user.model'
import { DEPTH, LOCK_SCOPE } from '../../../webdav/constants/webdav'
import { FILE_MODE } from '../../constants/operations'
import { LockConflict } from '../../models/file-lock-error'
import { FilesLockManager } from '../../services/files-lock-manager.service'
import * as filesUtils from '../../utils/files'
import { OnlyOfficeManager } from './only-office-manager.service'
import { ONLY_OFFICE_APP_LOCK } from './only-office.constants'

jest.mock('../../utils/files')
jest.mock('../../../users/utils/avatar', () => ({
  getAvatarBase64: jest.fn().mockResolvedValue('data:image/png;base64,iVBORw0KGgo=')
}))

describe(OnlyOfficeManager.name, () => {
  let service: OnlyOfficeManager
  let cache: jest.Mocked<Cache>
  let httpService: jest.Mocked<HttpService>
  let jwtService: jest.Mocked<JwtService>
  let filesLockManager: jest.Mocked<FilesLockManager>

  const mockUser = {
    id: 1,
    login: 'testuser',
    email: 'test@example.com',
    fullName: 'Test User',
    language: 'en',
    role: 'user',
    applications: []
  } as unknown as UserModel

  const mockSpaceEnv = {
    realPath: '/real/path/document.docx',
    relativeUrl: '/document.docx',
    url: 'space/document.docx',
    dbFile: {
      directory: '/space',
      name: 'document.docx',
      storageId: 1,
      storageTypeId: 1
    },
    permissions: 'r,m,d',
    envPermissions: 'r,m,d'
  } as unknown as SpaceEnv

  const mockRequest = {
    headers: {
      'user-agent': 'Mozilla/5.0'
    }
  } as any

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnlyOfficeManager,
        {
          provide: Cache,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn()
          }
        },
        {
          provide: HttpService,
          useValue: {
            axiosRef: jest.fn()
          }
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn(),
            verifyAsync: jest.fn()
          }
        },
        {
          provide: ContextManager,
          useValue: {
            headerOriginUrl: jest.fn().mockReturnValue('http://localhost:3000')
          }
        },
        {
          provide: FilesLockManager,
          useValue: {
            checkConflicts: jest.fn(),
            convertLockToFileLockProps: jest.fn(),
            create: jest.fn(),
            getLocksByPath: jest.fn(),
            removeLock: jest.fn(),
            isPathLocked: jest.fn()
          }
        }
      ]
    }).compile()

    module.useLogger(['fatal'])
    service = module.get<OnlyOfficeManager>(OnlyOfficeManager)
    cache = module.get(Cache)
    httpService = module.get(HttpService)
    jwtService = module.get(JwtService)
    filesLockManager = module.get(FilesLockManager)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('getSettings', () => {
    beforeEach(() => {
      ;(filesUtils.isPathExists as jest.Mock).mockResolvedValue(true)
      ;(filesUtils.isPathIsDir as jest.Mock).mockResolvedValue(false)
      filesLockManager.checkConflicts.mockResolvedValue(undefined)
      jwtService.signAsync.mockResolvedValue('mock-token')
      cache.get.mockResolvedValue(null)
      cache.set.mockResolvedValue(undefined)
      ;(filesUtils.genEtag as jest.Mock).mockReturnValue('mock-etag')
    })

    it('should return OnlyOffice settings for editable document', async () => {
      const result = await service.getSettings(mockUser, mockSpaceEnv, mockRequest)

      expect(result).toBeDefined()
      expect(result.config.documentType).toBe('word')
      expect(result.config.editorConfig.mode).toBe(FILE_MODE.EDIT)
      expect(result.config.document.permissions.edit).toBe(true)
      expect(result.hasLock).toBe(false)
    })

    it('should throw error if document does not exist', async () => {
      ;(filesUtils.isPathExists as jest.Mock).mockResolvedValue(false)

      await expect(service.getSettings(mockUser, mockSpaceEnv, mockRequest)).rejects.toThrow(
        new HttpException('Document not found', HttpStatus.BAD_REQUEST)
      )
    })

    it('should throw error if path is a directory', async () => {
      ;(filesUtils.isPathIsDir as jest.Mock).mockResolvedValue(true)

      await expect(service.getSettings(mockUser, mockSpaceEnv, mockRequest)).rejects.toThrow(
        new HttpException('Document must be a file', HttpStatus.BAD_REQUEST)
      )
    })

    it('should throw error if document extension is not supported', async () => {
      const unsupportedSpaceEnv = {
        ...mockSpaceEnv,
        realPath: '/real/path/document.xyz'
      } as unknown as SpaceEnv

      await expect(service.getSettings(mockUser, unsupportedSpaceEnv, mockRequest)).rejects.toThrow(
        new HttpException('Document not supported', HttpStatus.BAD_REQUEST)
      )
    })

    it('should set mode to VIEW when file has lock conflict', async () => {
      const mockLock = {
        key: 'lock-key',
        app: ONLY_OFFICE_APP_LOCK,
        owner: { id: 2, login: 'otheruser' }
      } as any
      const lockError = new LockConflict(mockLock, 'File is locked')
      filesLockManager.checkConflicts.mockRejectedValue(lockError)
      filesLockManager.convertLockToFileLockProps.mockReturnValue({
        owner: { id: 2, login: 'otheruser' }
      } as any)

      const result = await service.getSettings(mockUser, mockSpaceEnv, mockRequest)

      expect(result.config.editorConfig.mode).toBe(FILE_MODE.VIEW)
      expect(result.config.document.permissions.edit).toBe(false)
      expect(result.hasLock).toBeDefined()
    })

    it('should set mode to VIEW when user does not have modify permissions', async () => {
      const viewOnlySpaceEnv = {
        ...mockSpaceEnv,
        permissions: 'r',
        envPermissions: 'r'
      } as unknown as SpaceEnv

      const result = await service.getSettings(mockUser, viewOnlySpaceEnv, mockRequest)

      expect(result.config.editorConfig.mode).toBe(FILE_MODE.VIEW)
      expect(result.config.document.permissions.edit).toBe(false)
    })

    it('should detect mobile user agent', async () => {
      const mobileRequest = {
        headers: {
          'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)'
        }
      } as any

      const result = await service.getSettings(mockUser, mockSpaceEnv, mobileRequest)

      expect(result.config.type).toBe('mobile')
    })

    it('should use cached document key', async () => {
      cache.get.mockResolvedValue('cached-doc-key')

      const result = await service.getSettings(mockUser, mockSpaceEnv, mockRequest)

      expect(result.config.document.key).toBe('cached-doc-key')
      expect(cache.set).not.toHaveBeenCalled()
    })
  })

  describe('callBack', () => {
    const mockToken = 'mock-callback-token'

    beforeEach(() => {
      filesLockManager.removeLock.mockResolvedValue(undefined)
      filesLockManager.getLocksByPath.mockResolvedValue([])
      filesLockManager.isPathLocked.mockResolvedValue(false)
      cache.del.mockResolvedValue(true)
      ;(filesUtils.uniqueFilePathFromDir as jest.Mock).mockResolvedValue('/tmp/temp-file.docx')
      ;(filesUtils.writeFromStream as jest.Mock).mockResolvedValue(undefined)
      ;(filesUtils.fileSize as jest.Mock).mockResolvedValue(12)
      ;(filesUtils.copyFileContent as jest.Mock).mockResolvedValue(undefined)
      ;(filesUtils.removeFiles as jest.Mock).mockResolvedValue(undefined)
    })

    it('should handle status 1 (document being edited)', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        status: 1,
        actions: [],
        users: ['1']
      })

      const result = await service.callBack(mockUser, mockSpaceEnv, mockToken)

      expect(result).toEqual({ error: 0 })
    })

    it('should handle status 2 (document closed with changes)', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        status: 2,
        actions: [],
        users: [],
        notmodified: false,
        url: 'http://onlyoffice/document.docx?md5=abc123&expires=1739400549&shardkey=-33120641&filename=document.docx'
      })

      const mockStream = Readable.from(['mock content'])
      httpService.axiosRef.mockResolvedValue({
        data: mockStream,
        headers: { 'content-length': '12' },
        status: 200,
        statusText: 'OK',
        config: {} as any
      } as AxiosResponse)

      const result = await service.callBack(mockUser, mockSpaceEnv, mockToken)

      expect(result).toEqual({ error: 0 })
      expect(httpService.axiosRef).toHaveBeenCalled()
    })

    it('should handle status 2 (document closed without changes)', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        status: 2,
        actions: [],
        users: [],
        notmodified: true
      })

      const result = await service.callBack(mockUser, mockSpaceEnv, mockToken)

      expect(result).toEqual({ error: 0 })
      expect(httpService.axiosRef).not.toHaveBeenCalled()
    })

    it('should handle status 3 (error saving document)', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        status: 3,
        actions: [],
        url: 'http://onlyoffice/document.docx?md5=abc123&expires=1739400549&shardkey=-33120641&filename=document.docx'
      })

      const mockStream = Readable.from(['mock content'])
      httpService.axiosRef.mockResolvedValue({
        data: mockStream,
        headers: { 'content-length': '12' },
        status: 200,
        statusText: 'OK',
        config: {} as any
      } as AxiosResponse)

      const result = await service.callBack(mockUser, mockSpaceEnv, mockToken)

      expect(result).toEqual({ error: 0 })
      expect(httpService.axiosRef).toHaveBeenCalled()
    })

    it('should handle status 4 (document closed with no changes)', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        status: 4,
        actions: []
      })

      const result = await service.callBack(mockUser, mockSpaceEnv, mockToken)

      expect(result).toEqual({ error: 0 })
    })

    it('should handle status 6 (force save)', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        status: 6,
        actions: [],
        url: 'http://onlyoffice/document.docx?md5=abc123&expires=1739400549&shardkey=-33120641&filename=document.docx'
      })

      const mockStream = Readable.from(['mock content'])
      httpService.axiosRef.mockResolvedValue({
        data: mockStream,
        headers: { 'content-length': '12' },
        status: 200,
        statusText: 'OK',
        config: {} as any
      } as AxiosResponse)

      const result = await service.callBack(mockUser, mockSpaceEnv, mockToken)

      expect(result).toEqual({ error: 0 })
    })

    it('should handle status 7 (error force saving)', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        status: 7,
        actions: [],
        url: 'http://onlyoffice/document.docx?md5=abc123&expires=1739400549&shardkey=-33120641&filename=document.docx'
      })

      const mockStream = Readable.from(['mock content'])
      httpService.axiosRef.mockResolvedValue({
        data: mockStream,
        headers: { 'content-length': '12' },
        status: 200,
        statusText: 'OK',
        config: {} as any
      } as AxiosResponse)

      const result = await service.callBack(mockUser, mockSpaceEnv, mockToken)

      expect(result).toEqual({ error: 0 })
    })

    it('should handle user connect action (type 1)', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        status: 1,
        actions: [{ type: 1, userid: '1' }],
        users: ['1']
      })
      filesLockManager.create.mockResolvedValue([true, {} as any])

      const result = await service.callBack(mockUser, mockSpaceEnv, mockToken)

      expect(result).toEqual({ error: 0 })
      expect(filesLockManager.create).toHaveBeenCalledWith(
        mockUser,
        mockSpaceEnv.dbFile,
        ONLY_OFFICE_APP_LOCK,
        DEPTH.RESOURCE,
        {
          lockRoot: null,
          lockToken: null,
          lockScope: LOCK_SCOPE.SHARED
        },
        expect.any(Number)
      )
    })

    it('should handle user disconnect action (type 0)', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        status: 1,
        actions: [{ type: 0, userid: '1' }],
        users: undefined
      })
      filesLockManager.getLocksByPath.mockResolvedValue([{ key: 'lock-key', owner: { id: 1 } }] as any)

      const result = await service.callBack(mockUser, mockSpaceEnv, mockToken)

      expect(result).toEqual({ error: 0 })
      expect(filesLockManager.removeLock).toHaveBeenCalledWith('lock-key')
    })

    it('should return error when callback fails', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        status: 2,
        actions: [],
        notmodified: false,
        url: 'http://onlyoffice/document.docx?md5=abc123&expires=1739400549&shardkey=-33120641&filename=document.docx'
      })
      httpService.axiosRef.mockRejectedValue(new Error('Network error'))

      const result = await service.callBack(mockUser, mockSpaceEnv, mockToken)

      expect(result).toHaveProperty('error')
      expect(result.error).not.toBe(0)
    })

    it('should throw error when file lock creation fails', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        status: 1,
        actions: [{ type: 1, userid: '1' }],
        users: ['1']
      })
      filesLockManager.create.mockResolvedValue([false, null])

      const result = await service.callBack(mockUser, mockSpaceEnv, mockToken)

      expect(result).toHaveProperty('error')
      expect(result.error).not.toBe(0)
    })
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })
})
