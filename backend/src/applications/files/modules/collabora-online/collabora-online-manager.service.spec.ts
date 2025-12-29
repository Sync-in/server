/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpException, HttpStatus } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test, TestingModule } from '@nestjs/testing'
import { FastifyReply } from 'fastify'
import fs from 'node:fs/promises'
import { Readable } from 'node:stream'
import { ContextManager } from '../../../../infrastructure/context/services/context-manager.service'
import { SPACE_OPERATION } from '../../../spaces/constants/spaces'
import type { SpaceEnv } from '../../../spaces/models/space-env.model'
import type { UserModel } from '../../../users/models/user.model'
import { DEPTH, LOCK_SCOPE } from '../../../webdav/constants/webdav'
import { FILE_MODE } from '../../constants/operations'
import { FileLockProps } from '../../interfaces/file-props.interface'
import { LockConflict } from '../../models/file-lock-error'
import { FilesLockManager } from '../../services/files-lock-manager.service'
import * as filesUtils from '../../utils/files'
import { CollaboraOnlineManager } from './collabora-online-manager.service'
import { COLLABORA_APP_LOCK, COLLABORA_HEADERS, COLLABORA_LOCK_ACTION } from './collabora-online.constants'
import type { FastifyCollaboraOnlineSpaceRequest } from './collabora-online.interface'

jest.mock('../../utils/files')
jest.mock('node:fs/promises')
jest.mock('../../../users/utils/avatar')

describe(CollaboraOnlineManager.name, () => {
  let service: CollaboraOnlineManager
  let filesLockManager: FilesLockManager

  const mockUser: UserModel = {
    id: 1,
    login: 'testuser',
    email: 'test@example.com',
    fullName: 'Test User',
    language: 'en',
    role: 1,
    applications: []
  } as UserModel

  const mockSpace = {
    realPath: '/path/to/document.docx',
    url: '/files/document.docx',
    envPermissions: '',
    dbFile: {
      id: 1,
      path: '/document.docx',
      ownerId: 1,
      name: 'document.docx'
    }
  } as unknown as SpaceEnv

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CollaboraOnlineManager,
        {
          provide: ContextManager,
          useValue: {
            headerOriginUrl: jest.fn().mockReturnValue('https://domain.com')
          }
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn().mockResolvedValue('mock-jwt-token')
          }
        },
        {
          provide: FilesLockManager,
          useValue: {
            checkConflicts: jest.fn(),
            convertLockToFileLockProps: jest.fn(),
            create: jest.fn(),
            removeLock: jest.fn(),
            getLocksByPath: jest.fn(),
            isLockedWithToken: jest.fn(),
            refreshLockTimeout: jest.fn()
          }
        }
      ]
    }).compile()

    module.useLogger(['fatal'])
    service = module.get<CollaboraOnlineManager>(CollaboraOnlineManager)
    filesLockManager = module.get<FilesLockManager>(FilesLockManager)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('getSettings', () => {
    beforeEach(() => {
      jest.spyOn(filesUtils, 'isPathExists').mockResolvedValue(true)
      jest.spyOn(filesUtils, 'isPathIsDir').mockResolvedValue(false)
      jest.spyOn(filesUtils, 'genUniqHashFromFileDBProps').mockReturnValue('file-hash-123')
    })

    it('should return settings with edit mode when user has modify permissions and no lock conflicts', async () => {
      const spaceWithPermissions = {
        ...mockSpace,
        envPermissions: SPACE_OPERATION.MODIFY
      } as unknown as SpaceEnv

      jest.spyOn(filesLockManager, 'checkConflicts').mockResolvedValue(undefined)

      const result = await service.getSettings(mockUser, spaceWithPermissions)

      expect(result).toEqual({
        documentServerUrl: expect.stringContaining('file-hash-123'),
        mode: FILE_MODE.EDIT,
        hasLock: false
      })
      expect(filesLockManager.checkConflicts).toHaveBeenCalledWith(
        mockSpace.dbFile,
        DEPTH.RESOURCE,
        expect.objectContaining({
          userId: mockUser.id,
          app: COLLABORA_APP_LOCK,
          lockScope: LOCK_SCOPE.SHARED
        })
      )
    })

    it('should return settings with view mode when lock conflict exists', async () => {
      const spaceWithPermissions = {
        ...mockSpace,
        envPermissions: SPACE_OPERATION.MODIFY
      } as unknown as SpaceEnv

      const mockLock = { userId: 2, options: { lockToken: 'token-123' } }
      const mockFileLockProps: FileLockProps = {
        owner: {
          id: 2,
          login: 'otheruser',
          email: 'other@example.com',
          fullName: 'Other User'
        },
        app: COLLABORA_APP_LOCK,
        isExclusive: false
      }

      jest.spyOn(filesLockManager, 'checkConflicts').mockRejectedValue(new LockConflict(mockLock as any, 'conflict'))
      jest.spyOn(filesLockManager, 'convertLockToFileLockProps').mockReturnValue(mockFileLockProps)

      const result = await service.getSettings(mockUser, spaceWithPermissions)

      expect(result.mode).toBe(FILE_MODE.VIEW)
      expect(result.hasLock).toEqual(mockFileLockProps)
    })

    it('should return view mode when user does not have modify permissions', async () => {
      const spaceWithoutPermissions = {
        ...mockSpace,
        envPermissions: ''
      } as unknown as SpaceEnv

      const result = await service.getSettings(mockUser, spaceWithoutPermissions)

      expect(result.mode).toBe(FILE_MODE.VIEW)
      expect(filesLockManager.checkConflicts).not.toHaveBeenCalled()
    })

    it('should throw error when document extension is not supported', async () => {
      const spaceWithUnsupportedFile = {
        ...mockSpace,
        realPath: '/path/to/document.xyz'
      } as unknown as SpaceEnv

      jest.spyOn(filesUtils, 'isPathExists').mockResolvedValue(true)
      jest.spyOn(filesUtils, 'isPathIsDir').mockResolvedValue(false)

      await expect(service.getSettings(mockUser, spaceWithUnsupportedFile)).rejects.toThrow(
        new HttpException('Document not supported', HttpStatus.BAD_REQUEST)
      )
    })

    it('should throw error when document does not exist', async () => {
      jest.spyOn(filesUtils, 'isPathExists').mockResolvedValue(false)

      await expect(service.getSettings(mockUser, mockSpace)).rejects.toThrow(new HttpException('Document not found', HttpStatus.NOT_FOUND))
    })

    it('should throw error when path is a directory', async () => {
      jest.spyOn(filesUtils, 'isPathExists').mockResolvedValue(true)
      jest.spyOn(filesUtils, 'isPathIsDir').mockResolvedValue(true)

      await expect(service.getSettings(mockUser, mockSpace)).rejects.toThrow(new HttpException('Document must be a file', HttpStatus.BAD_REQUEST))
    })
  })

  describe('checkFileInfo', () => {
    it('should return file information', async () => {
      const mockStats = {
        size: 1024,
        mtime: new Date('2024-01-01T10:00:00Z')
      }

      const mockRequest = {
        user: mockUser,
        space: {
          ...mockSpace,
          envPermissions: SPACE_OPERATION.MODIFY
        }
      } as unknown as FastifyCollaboraOnlineSpaceRequest

      jest.spyOn(fs, 'stat').mockResolvedValue(mockStats as any)
      jest.spyOn(filesUtils, 'fileName').mockReturnValue('document.docx')
      jest.spyOn(filesUtils, 'genEtag').mockReturnValue('etag-123')
      const { getAvatarBase64 } = await import('../../../users/utils/avatar')
      ;(getAvatarBase64 as jest.Mock).mockResolvedValue('base64-avatar')

      const result = await service.checkFileInfo(mockRequest)

      expect(result).toEqual({
        BaseFileName: 'document.docx',
        Version: 'etag-123',
        OwnerId: '1',
        Size: 1024,
        LastModifiedTime: '2024-01-01T10:00:00.000Z',
        UserId: '1',
        UserFriendlyName: 'Test User (test@example.com)',
        ReadOnly: false,
        UserExtraInfo: { avatar: 'base64-avatar' },
        UserCanNotWriteRelative: true,
        UserCanWrite: true,
        UserCanRename: false,
        SupportsUpdate: true,
        SupportsRename: false,
        SupportsExport: true,
        SupportsCoauth: true,
        SupportsLocks: true,
        SupportsGetLock: true
      })
    })

    it('should set UserCanWrite to false when user does not have modify permissions', async () => {
      const mockStats = {
        size: 1024,
        mtime: new Date('2024-01-01T10:00:00Z')
      }

      const mockRequest = {
        user: mockUser,
        space: {
          ...mockSpace,
          envPermissions: ''
        }
      } as unknown as FastifyCollaboraOnlineSpaceRequest

      jest.spyOn(fs, 'stat').mockResolvedValue(mockStats as any)
      jest.spyOn(filesUtils, 'fileName').mockReturnValue('document.docx')
      jest.spyOn(filesUtils, 'genEtag').mockReturnValue('etag-123')
      const { getAvatarBase64 } = await import('../../../users/utils/avatar')
      ;(getAvatarBase64 as jest.Mock).mockResolvedValue('base64-avatar')

      const result = await service.checkFileInfo(mockRequest)

      expect(result.UserCanWrite).toBe(false)
    })
  })

  describe('saveDocument', () => {
    beforeEach(() => {
      jest.spyOn(filesUtils, 'isPathExists').mockResolvedValue(true)
      jest.spyOn(filesUtils, 'isPathIsDir').mockResolvedValue(false)
      jest.spyOn(filesUtils, 'fileName').mockReturnValue('document.docx')
      jest.spyOn(filesUtils, 'uniqueFilePathFromDir').mockResolvedValue('/tmp/document-unique.docx')
      jest.spyOn(filesUtils, 'writeFromStream').mockResolvedValue(undefined)
      jest.spyOn(filesUtils, 'copyFileContent').mockResolvedValue(undefined)
      jest.spyOn(filesUtils, 'removeFiles').mockResolvedValue(undefined)
    })

    it('should save document successfully', async () => {
      const mockStats = {
        mtime: new Date('2024-01-01T11:00:00Z')
      }

      const mockRequest = {
        user: mockUser,
        space: mockSpace,
        headers: {
          'content-length': '1024'
        },
        raw: new Readable()
      } as unknown as FastifyCollaboraOnlineSpaceRequest

      jest.spyOn(fs, 'stat').mockResolvedValue(mockStats as any)
      jest.spyOn(filesUtils, 'fileSize').mockResolvedValue(1024)

      const result = await service.saveDocument(mockRequest)

      expect(result).toEqual({
        LastModifiedTime: '2024-01-01T11:00:00.000Z'
      })
      expect(filesUtils.writeFromStream).toHaveBeenCalledWith('/tmp/document-unique.docx', mockRequest.raw)
      expect(filesUtils.copyFileContent).toHaveBeenCalledWith('/tmp/document-unique.docx', mockSpace.realPath)
      expect(filesUtils.removeFiles).toHaveBeenCalledWith('/tmp/document-unique.docx')
    })

    it('should throw error when document size mismatch', async () => {
      const mockRequest = {
        user: mockUser,
        space: mockSpace,
        headers: {
          'content-length': '1024',
          [COLLABORA_HEADERS.Timestamp]: '2024-01-01T10:00:00.000Z'
        },
        raw: new Readable()
      } as unknown as FastifyCollaboraOnlineSpaceRequest

      jest.spyOn(filesUtils, 'fileSize').mockResolvedValue(512)
      jest.spyOn(fs, 'stat').mockResolvedValue({ mtime: new Date('2024-01-01T10:00:00.000Z') } as any)

      await expect(service.saveDocument(mockRequest)).rejects.toThrow(new HttpException('Size Mismatch', HttpStatus.BAD_REQUEST))
    })

    it('should throw error when timestamp mismatch', async () => {
      const mockRequest = {
        user: mockUser,
        space: mockSpace,
        headers: {
          'content-length': '1024',
          [COLLABORA_HEADERS.Timestamp]: '2024-01-01T10:00:00.000Z'
        },
        raw: new Readable()
      } as unknown as FastifyCollaboraOnlineSpaceRequest

      jest.spyOn(fs, 'stat').mockResolvedValue({ mtime: new Date('2024-01-01T11:00:00.000Z') } as any)

      await expect(service.saveDocument(mockRequest)).rejects.toThrow(new HttpException({ LOOLStatusCode: 1010 }, HttpStatus.CONFLICT))
    })

    it('should throw error when document does not exist', async () => {
      const mockRequest = {
        user: mockUser,
        space: mockSpace,
        headers: {
          'content-length': '1024'
        },
        raw: new Readable()
      } as unknown as FastifyCollaboraOnlineSpaceRequest

      jest.spyOn(filesUtils, 'isPathExists').mockResolvedValue(false)

      await expect(service.saveDocument(mockRequest)).rejects.toThrow(new HttpException('Document not found', HttpStatus.NOT_FOUND))
    })
  })

  describe('manageLock', () => {
    const mockReply = {
      header: jest.fn().mockReturnThis()
    } as unknown as FastifyReply

    describe('LOCK action', () => {
      it('should create a new lock', async () => {
        const mockRequest = {
          user: mockUser,
          space: mockSpace,
          headers: {
            [COLLABORA_HEADERS.Action]: COLLABORA_LOCK_ACTION.LOCK,
            [COLLABORA_HEADERS.LockToken]: 'new-lock-token'
          }
        } as unknown as FastifyCollaboraOnlineSpaceRequest

        jest.spyOn(filesLockManager, 'isLockedWithToken').mockResolvedValue(null)
        jest.spyOn(filesLockManager, 'create').mockResolvedValue([true, {} as any])

        await service.manageLock(mockRequest, mockReply)

        expect(filesLockManager.create).toHaveBeenCalledWith(
          mockUser,
          mockSpace.dbFile,
          COLLABORA_APP_LOCK,
          DEPTH.RESOURCE,
          expect.objectContaining({
            lockToken: 'new-lock-token',
            lockScope: LOCK_SCOPE.SHARED
          }),
          expect.any(Number)
        )
      })

      it('should refresh existing lock', async () => {
        const mockRequest = {
          user: mockUser,
          space: mockSpace,
          headers: {
            [COLLABORA_HEADERS.Action]: COLLABORA_LOCK_ACTION.LOCK,
            [COLLABORA_HEADERS.LockToken]: 'existing-lock-token'
          }
        } as unknown as FastifyCollaboraOnlineSpaceRequest

        const existingLock = { key: 'lock-key', options: { lockToken: 'existing-lock-token' } }
        jest.spyOn(filesLockManager, 'isLockedWithToken').mockResolvedValue(existingLock as any)
        jest.spyOn(filesLockManager, 'refreshLockTimeout').mockResolvedValue(undefined)

        await service.manageLock(mockRequest, mockReply)

        expect(filesLockManager.refreshLockTimeout).toHaveBeenCalledWith(existingLock, expect.any(Number))
        expect(filesLockManager.create).not.toHaveBeenCalled()
      })

      it('should throw conflict when lock creation fails', async () => {
        const mockRequest = {
          user: mockUser,
          space: mockSpace,
          headers: {
            [COLLABORA_HEADERS.Action]: COLLABORA_LOCK_ACTION.LOCK,
            [COLLABORA_HEADERS.LockToken]: 'new-lock-token'
          }
        } as unknown as FastifyCollaboraOnlineSpaceRequest

        const conflictingLock = { options: { lockToken: 'conflicting-token' } }
        jest.spyOn(filesLockManager, 'isLockedWithToken').mockResolvedValue(null)
        jest.spyOn(filesLockManager, 'create').mockResolvedValue([false, conflictingLock as any])

        await expect(service.manageLock(mockRequest, mockReply)).rejects.toThrow(new HttpException('The file is locked', HttpStatus.CONFLICT))
        expect(mockReply.header).toHaveBeenCalledWith(COLLABORA_HEADERS.LockToken, 'conflicting-token')
      })

      it('should throw error when lock token is missing', async () => {
        const mockRequest = {
          user: mockUser,
          space: mockSpace,
          headers: {
            [COLLABORA_HEADERS.Action]: COLLABORA_LOCK_ACTION.LOCK
          }
        } as unknown as FastifyCollaboraOnlineSpaceRequest

        await expect(service.manageLock(mockRequest, mockReply)).rejects.toThrow(new HttpException('Lock token is required', HttpStatus.CONFLICT))
      })
    })

    describe('UNLOCK action', () => {
      it('should remove existing lock', async () => {
        const mockRequest = {
          user: mockUser,
          space: mockSpace,
          headers: {
            [COLLABORA_HEADERS.Action]: COLLABORA_LOCK_ACTION.UNLOCK,
            [COLLABORA_HEADERS.LockToken]: 'lock-token-to-remove'
          }
        } as unknown as FastifyCollaboraOnlineSpaceRequest

        const existingLock = { key: 'lock-key', options: { lockToken: 'lock-token-to-remove' } }
        jest.spyOn(filesLockManager, 'isLockedWithToken').mockResolvedValue(existingLock as any)
        jest.spyOn(filesLockManager, 'removeLock').mockResolvedValue(undefined)

        await service.manageLock(mockRequest, mockReply)

        expect(filesLockManager.removeLock).toHaveBeenCalledWith('lock-key')
      })

      it('should throw error when lock does not exist', async () => {
        const mockRequest = {
          user: mockUser,
          space: mockSpace,
          headers: {
            [COLLABORA_HEADERS.Action]: COLLABORA_LOCK_ACTION.UNLOCK,
            [COLLABORA_HEADERS.LockToken]: 'non-existent-token'
          }
        } as unknown as FastifyCollaboraOnlineSpaceRequest

        jest.spyOn(filesLockManager, 'isLockedWithToken').mockResolvedValue(null)

        await expect(service.manageLock(mockRequest, mockReply)).rejects.toThrow(new HttpException('Lock not found', HttpStatus.CONFLICT))
      })
    })

    describe('GET_LOCK action', () => {
      it('should return lock token when lock exists', async () => {
        const mockRequest = {
          user: mockUser,
          space: mockSpace,
          headers: {
            [COLLABORA_HEADERS.Action]: COLLABORA_LOCK_ACTION.GET_LOCK
          }
        } as unknown as FastifyCollaboraOnlineSpaceRequest

        const existingLock = { options: { lockToken: 'existing-lock-token' } }
        jest.spyOn(filesLockManager, 'getLocksByPath').mockResolvedValue([existingLock as any])

        await service.manageLock(mockRequest, mockReply)

        expect(mockReply.header).toHaveBeenCalledWith(COLLABORA_HEADERS.LockToken, 'existing-lock-token')
      })

      it('should not set header when no lock exists', async () => {
        const mockRequest = {
          user: mockUser,
          space: mockSpace,
          headers: {
            [COLLABORA_HEADERS.Action]: COLLABORA_LOCK_ACTION.GET_LOCK
          }
        } as unknown as FastifyCollaboraOnlineSpaceRequest

        jest.spyOn(filesLockManager, 'getLocksByPath').mockResolvedValue([])

        await service.manageLock(mockRequest, mockReply)

        expect(mockReply.header).not.toHaveBeenCalled()
      })
    })

    describe('REFRESH_LOCK action', () => {
      it('should refresh existing lock', async () => {
        const mockRequest = {
          user: mockUser,
          space: mockSpace,
          headers: {
            [COLLABORA_HEADERS.Action]: COLLABORA_LOCK_ACTION.REFRESH_LOCK,
            [COLLABORA_HEADERS.LockToken]: 'lock-token-to-refresh'
          }
        } as unknown as FastifyCollaboraOnlineSpaceRequest

        const existingLock = { key: 'lock-key', options: { lockToken: 'lock-token-to-refresh' } }
        jest.spyOn(filesLockManager, 'isLockedWithToken').mockResolvedValue(existingLock as any)
        jest.spyOn(filesLockManager, 'refreshLockTimeout').mockResolvedValue(undefined)

        await service.manageLock(mockRequest, mockReply)

        expect(filesLockManager.refreshLockTimeout).toHaveBeenCalledWith(existingLock, expect.any(Number))
      })

      it('should throw error when lock does not exist', async () => {
        const mockRequest = {
          user: mockUser,
          space: mockSpace,
          headers: {
            [COLLABORA_HEADERS.Action]: COLLABORA_LOCK_ACTION.REFRESH_LOCK,
            [COLLABORA_HEADERS.LockToken]: 'non-existent-token'
          }
        } as unknown as FastifyCollaboraOnlineSpaceRequest

        jest.spyOn(filesLockManager, 'isLockedWithToken').mockResolvedValue(null)

        await expect(service.manageLock(mockRequest, mockReply)).rejects.toThrow(new HttpException('Lock not found', HttpStatus.CONFLICT))
      })
    })

    describe('Unknown action', () => {
      it('should throw error for unknown lock action', async () => {
        const mockRequest = {
          user: mockUser,
          space: mockSpace,
          headers: {
            [COLLABORA_HEADERS.Action]: 'UNKNOWN_ACTION'
          }
        } as unknown as FastifyCollaboraOnlineSpaceRequest

        await expect(service.manageLock(mockRequest, mockReply)).rejects.toThrow(new HttpException('Unknown lock action', HttpStatus.BAD_REQUEST))
      })
    })
  })
})
