import { HttpService } from '@nestjs/axios'
import { HttpException, HttpStatus } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test, TestingModule } from '@nestjs/testing'
import { AxiosResponse } from 'axios'
import { Readable } from 'stream'
import { Mocked } from 'vitest'
import { TOKEN_TYPE } from '../../../../authentication/interfaces/token.interface'
import { configuration } from '../../../../configuration/config.environment'
import { Cache } from '../../../../infrastructure/cache/cache.service'
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

vi.mock('../../utils/files')
vi.mock('../../../users/utils/avatar', () => ({
  getAvatarBase64: vi.fn().mockResolvedValue('data:image/png;base64,iVBORw0KGgo=')
}))

describe(OnlyOfficeManager.name, () => {
  let service: OnlyOfficeManager
  let cache: Mocked<Cache>
  let httpService: Mocked<HttpService>
  let jwtService: Mocked<JwtService>
  let filesLockManager: Mocked<FilesLockManager>
  let onlyOfficeEnabled: boolean
  let onlyOfficeExternalServer: string

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
    onlyOfficeEnabled = configuration.applications.files.editors.onlyoffice.enabled
    onlyOfficeExternalServer = configuration.applications.files.editors.onlyoffice.externalServer
    configuration.applications.files.editors.onlyoffice.enabled = true
    configuration.applications.files.editors.onlyoffice.externalServer = null

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnlyOfficeManager,
        {
          provide: Cache,
          useValue: {
            get: vi.fn(),
            set: vi.fn(),
            del: vi.fn()
          }
        },
        {
          provide: HttpService,
          useValue: {
            axiosRef: vi.fn()
          }
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: vi.fn(),
            verifyAsync: vi.fn()
          }
        },
        {
          provide: ContextManager,
          useValue: {
            headerOriginUrl: vi.fn().mockReturnValue('http://localhost:3000')
          }
        },
        {
          provide: FilesLockManager,
          useValue: {
            checkConflicts: vi.fn(),
            convertLockToFileLockProps: vi.fn(),
            create: vi.fn(),
            getLocksByPath: vi.fn(),
            removeLock: vi.fn(),
            isPathLocked: vi.fn()
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
    configuration.applications.files.editors.onlyoffice.enabled = onlyOfficeEnabled
    configuration.applications.files.editors.onlyoffice.externalServer = onlyOfficeExternalServer
    vi.clearAllMocks()
  })

  describe('getSettings', () => {
    beforeEach(() => {
      vi.mocked(filesUtils.isPathExists).mockResolvedValue(true)
      vi.mocked(filesUtils.isPathIsDir).mockResolvedValue(false)
      filesLockManager.checkConflicts.mockResolvedValue(undefined)
      jwtService.signAsync.mockResolvedValue('mock-token')
      cache.get.mockResolvedValue(null)
      cache.set.mockResolvedValue(undefined)
      vi.mocked(filesUtils.genEtag).mockReturnValue('mock-etag')
    })

    it('should return OnlyOffice settings for editable document', async () => {
      const result = await service.getSettings(mockUser, mockSpaceEnv, mockRequest)

      expect(result).toBeDefined()
      expect(result.config.documentType).toBe('word')
      expect(result.config.editorConfig.mode).toBe(FILE_MODE.EDIT)
      expect(result.config.document.permissions.edit).toBe(true)
      expect(result.hasLock).toBe(false)
      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenType: TOKEN_TYPE.ONLY_OFFICE
        }),
        expect.any(Object)
      )
    })

    it('should throw error if document does not exist', async () => {
      vi.mocked(filesUtils.isPathExists).mockResolvedValue(false)

      await expect(service.getSettings(mockUser, mockSpaceEnv, mockRequest)).rejects.toThrow(
        new HttpException('Document not found', HttpStatus.BAD_REQUEST)
      )
    })

    it('should throw error if path is a directory', async () => {
      vi.mocked(filesUtils.isPathIsDir).mockResolvedValue(true)

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

    it('should set mode to VIEW when document is in trash repository', async () => {
      const trashSpaceEnv = {
        ...mockSpaceEnv,
        inTrashRepository: true
      } as unknown as SpaceEnv

      const result = await service.getSettings(mockUser, trashSpaceEnv, mockRequest)

      expect(result.config.editorConfig.mode).toBe(FILE_MODE.VIEW)
      expect(result.config.document.permissions.edit).toBe(false)
      expect(filesLockManager.checkConflicts).not.toHaveBeenCalled()
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
    const mockDocumentUrl = 'http://localhost:3000/onlyoffice/document.docx?md5=abc123&expires=1739400549&shardkey=-33120641&filename=document.docx'

    beforeEach(() => {
      filesLockManager.removeLock.mockResolvedValue(undefined)
      filesLockManager.getLocksByPath.mockResolvedValue([])
      filesLockManager.isPathLocked.mockResolvedValue(false)
      cache.del.mockResolvedValue(true)
      vi.mocked(filesUtils.uniqueFilePathFromDir).mockResolvedValue('/tmp/temp-file.docx')
      vi.mocked(filesUtils.writeFromStream).mockResolvedValue(undefined)
      vi.mocked(filesUtils.fileSize).mockResolvedValue(12)
      vi.mocked(filesUtils.copyFileContent).mockResolvedValue(undefined)
      vi.mocked(filesUtils.removeFiles).mockResolvedValue(undefined)
    })

    const mockSuccessfulDownload = () => {
      httpService.axiosRef.mockResolvedValue({
        data: Readable.from(['mock content']),
        headers: { 'content-length': '12' },
        status: 200,
        statusText: 'OK',
        config: {} as any
      } as AxiosResponse)
    }

    const expectSuccessfulSaveCallback = async (url: string, callbackData: Record<string, any> = {}) => {
      jwtService.verifyAsync.mockResolvedValue({
        status: 2,
        actions: [],
        users: [],
        notmodified: false,
        url,
        ...callbackData
      })
      mockSuccessfulDownload()

      const result = await service.callBack(mockUser, mockSpaceEnv, mockToken)

      expect(result).toEqual({ error: 0 })
      expect(httpService.axiosRef).toHaveBeenCalledWith(expect.objectContaining({ url, maxRedirects: 0 }))
    }

    it('should allow internal container document downloads when external server is not configured', async () => {
      const internalDocumentUrl = 'http://onlyoffice/document.docx?md5=abc123&expires=1739400549&shardkey=-33120641&filename=document.docx'
      await expectSuccessfulSaveCallback(internalDocumentUrl)
    })

    it('should allow document downloads from the external server origin with a rewritten path', async () => {
      ;(service as any).externalOnlyOfficeServer = 'https://office.example.com/onlyoffice'
      const rewrittenPathUrl =
        'https://office.example.com/cache/files/document.docx?md5=abc123&expires=1739400549&shardkey=-33120641&filename=document.docx'
      await expectSuccessfulSaveCallback(rewrittenPathUrl)
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
      await expectSuccessfulSaveCallback(mockDocumentUrl, { status: 3 })
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
      await expectSuccessfulSaveCallback(mockDocumentUrl, { status: 6 })
    })

    it('should handle status 7 (error force saving)', async () => {
      await expectSuccessfulSaveCallback(mockDocumentUrl, { status: 7 })
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
        url: mockDocumentUrl
      })
      httpService.axiosRef.mockRejectedValue(new Error('Network error'))

      const result = await service.callBack(mockUser, mockSpaceEnv, mockToken)

      expect(result).toHaveProperty('error')
      expect(result.error).not.toBe(0)
    })

    it('should reject document downloads from unexpected hosts when external server is configured', async () => {
      ;(service as any).externalOnlyOfficeServer = 'http://localhost:3000/onlyoffice'
      jwtService.verifyAsync.mockResolvedValue({
        status: 2,
        actions: [],
        users: [],
        notmodified: false,
        url: 'http://internal-service.local/document.docx?md5=abc123&expires=1739400549&shardkey=-33120641&filename=document.docx'
      })

      const result = await service.callBack(mockUser, mockSpaceEnv, mockToken)

      expect(result).toEqual({ error: 'document download url is not allowed' })
      expect(httpService.axiosRef).not.toHaveBeenCalled()
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
})
