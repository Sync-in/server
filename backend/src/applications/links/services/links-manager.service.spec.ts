/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpService } from '@nestjs/axios'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Test, TestingModule } from '@nestjs/testing'
import { AuthManager } from '../../../authentication/services/auth-manager.service'
import { Cache } from '../../../infrastructure/cache/services/cache.service'
import { ContextManager } from '../../../infrastructure/context/services/context-manager.service'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import { FilesLockManager } from '../../files/services/files-lock-manager.service'
import { FilesManager } from '../../files/services/files-manager.service'
import { FilesQueries } from '../../files/services/files-queries.service'
import { NotificationsManager } from '../../notifications/services/notifications-manager.service'
import { SharesManager } from '../../shares/services/shares-manager.service'
import { SharesQueries } from '../../shares/services/shares-queries.service'
import { SpacesManager } from '../../spaces/services/spaces-manager.service'
import { SpacesQueries } from '../../spaces/services/spaces-queries.service'
import { UserModel } from '../../users/models/user.model'
import { AdminUsersManager } from '../../users/services/admin-users-manager.service'
import { AdminUsersQueries } from '../../users/services/admin-users-queries.service'
import { UsersManager } from '../../users/services/users-manager.service'
import { UsersQueries } from '../../users/services/users-queries.service'
import { getAvatarBase64 } from '../../users/utils/avatar'
import { LinksManager } from './links-manager.service'
import { LinksQueries } from './links-queries.service'

jest.mock('../../users/utils/avatar', () => ({
  getAvatarBase64: jest.fn()
}))

describe(LinksManager.name, () => {
  let service: LinksManager
  let linksQueriesMock: jest.Mocked<LinksQueries>
  let usersManagerMock: jest.Mocked<UsersManager>
  let filesManagerMock: jest.Mocked<FilesManager>
  let spacesManagerMock: jest.Mocked<SpacesManager>
  let authManagerMock: jest.Mocked<AuthManager>

  const identity: any = { id: 42, login: 'visitor' }
  const baseLink: any = {
    uuid: 'uuid-123',
    user: { id: 7, login: 'john', isActive: true },
    requireAuth: false,
    limitAccess: 0,
    nbAccess: 0,
    expiresAt: null
  }

  beforeAll(async () => {
    linksQueriesMock = {
      linkFromUUID: jest.fn(),
      spaceLink: jest.fn(),
      incrementLinkNbAccess: jest.fn().mockResolvedValue(undefined)
    } as any

    usersManagerMock = {
      compareUserPassword: jest.fn(),
      updateAccesses: jest.fn()
    } as any

    filesManagerMock = {
      sendFileFromSpace: jest.fn()
    } as any

    spacesManagerMock = {
      spaceEnv: jest.fn()
    } as any

    authManagerMock = {
      setCookies: jest.fn()
    } as any

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: DB_TOKEN_PROVIDER,
          useValue: {}
        },
        {
          provide: Cache,
          useValue: {}
        },
        { provide: ContextManager, useValue: {} },
        {
          provide: NotificationsManager,
          useValue: {}
        },
        { provide: HttpService, useValue: {} },
        { provide: FilesLockManager, useValue: {} },
        { provide: ConfigService, useValue: {} },
        { provide: JwtService, useValue: {} },
        { provide: AuthManager, useValue: authManagerMock },
        { provide: UsersManager, useValue: usersManagerMock },
        { provide: UsersQueries, useValue: {} },
        { provide: AdminUsersManager, useValue: {} },
        { provide: AdminUsersQueries, useValue: {} },
        { provide: FilesQueries, useValue: {} },
        { provide: FilesManager, useValue: filesManagerMock },
        { provide: SpacesQueries, useValue: {} },
        { provide: SpacesManager, useValue: spacesManagerMock },
        { provide: SharesQueries, useValue: {} },
        { provide: SharesManager, useValue: {} },
        { provide: LinksQueries, useValue: linksQueriesMock },
        LinksManager
      ]
    }).compile()

    module.useLogger(['fatal'])
    service = module.get<LinksManager>(LinksManager)
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('linkValidation', () => {
    it('returns ok with sanitized owner and avatar when link is valid', async () => {
      const link = { ...baseLink }
      linksQueriesMock.linkFromUUID.mockResolvedValueOnce(link)
      const spaceLink = {
        owner: { login: 'jane' },
        share: { isDir: true, alias: 's-alias', name: 'Docs' },
        space: null
      } as any
      linksQueriesMock.spaceLink.mockResolvedValueOnce(spaceLink)
      ;(getAvatarBase64 as jest.Mock).mockResolvedValueOnce('base64-xxx')

      const res = await service.linkValidation(identity, link.uuid)

      expect(res.ok).toBe(true)
      expect(res.error).toBeNull()
      expect(res.link).toBe(spaceLink)
      expect((spaceLink.owner as any).login).toBeUndefined()
      expect(linksQueriesMock.spaceLink).toHaveBeenCalledWith(link.uuid)
      expect(getAvatarBase64).toHaveBeenCalledWith('jane')

      // extra coverage: directly assert private checkLink with default ignoreAuth=false
      const directCheck = (service as any).checkLink(identity, link)
      expect(directCheck).toBe(true)
    })

    it('returns error and null link when uuid is not found', async () => {
      linksQueriesMock.linkFromUUID.mockResolvedValueOnce(null)

      const res = await service.linkValidation(identity, 'missing-uuid')

      expect(res.ok).toBe(false)
      expect(res.error).toBeDefined()
      expect(res.link).toBeNull()
    })

    it('returns unauthorized when auth is required and identity differs', async () => {
      const link = { ...baseLink, requireAuth: true }
      linksQueriesMock.linkFromUUID.mockResolvedValueOnce(link)

      const res = await service.linkValidation(identity, link.uuid)

      expect(res.ok).toBe(false)
      expect(String(res.error).toLowerCase()).toContain('unauthorized')
      expect(res.link).toBeNull()

      // extra coverage: directly assert private checkLink with default ignoreAuth=false
      const directCheck = (service as any).checkLink(identity, link)
      expect(String(directCheck).toLowerCase()).toContain('unauthorized')
    })

    it('returns exceeded when nbAccess >= limitAccess', async () => {
      const link = { ...baseLink, limitAccess: 5, nbAccess: 5 }
      linksQueriesMock.linkFromUUID.mockResolvedValueOnce(link)

      const res = await service.linkValidation(identity, link.uuid)

      expect(res.ok).toBe(false)
      expect(String(res.error).toLowerCase()).toContain('exceeded')
    })
  })

  describe('linkAccess', () => {
    const req: any = { ip: '127.0.0.1' }
    const res: any = {}

    it('streams a file when link targets a single file', async () => {
      const link = { ...baseLink, limitAccess: 10 }
      linksQueriesMock.linkFromUUID.mockResolvedValueOnce(link)
      const spaceLink = {
        space: null,
        share: { isDir: false, name: 'file.txt', alias: 'share-alias' }
      } as any
      linksQueriesMock.spaceLink.mockResolvedValueOnce(spaceLink)

      spacesManagerMock.spaceEnv.mockResolvedValueOnce({} as any)
      const streamable: any = { some: 'stream' }
      filesManagerMock.sendFileFromSpace.mockReturnValueOnce({
        checks: jest.fn().mockResolvedValueOnce(undefined),
        stream: jest.fn().mockResolvedValueOnce(streamable)
      } as any)

      // cover: incrementLinkNbAccess.catch(...) should log an error when the query rejects
      const logErrorSpy = jest.spyOn((service as any).logger, 'error').mockImplementation(() => undefined as any)
      linksQueriesMock.incrementLinkNbAccess.mockRejectedValueOnce(new Error('increment boom'))

      const result = await service.linkAccess(identity, link.uuid, req, res)

      expect(result).toBe(streamable)
      expect(filesManagerMock.sendFileFromSpace).toHaveBeenCalled()
      expect(linksQueriesMock.incrementLinkNbAccess).toHaveBeenCalledWith(link.uuid)
      // Assert repository selection for a share file (space falsy)
      // should call spacesManager.spaceEnv with SHARES and share alias when link.space is falsy
      expect(spacesManagerMock.spaceEnv).toHaveBeenCalledWith(expect.anything(), ['shares', 'share-alias'])
      // should log error when increment fails
      expect(logErrorSpy).toHaveBeenCalled()
    })

    it('authenticates and returns cookies when link targets a directory and user is different', async () => {
      const link = { ...baseLink, requireAuth: false, user: { id: 7, login: 'john', isActive: true } }
      linksQueriesMock.linkFromUUID.mockResolvedValueOnce(link)
      const spaceLink = {
        space: { alias: 'files', name: 'My Space' },
        share: { isDir: true, name: 'ignored', alias: 'ignored' }
      } as any
      linksQueriesMock.spaceLink.mockResolvedValueOnce(spaceLink)

      const loginDto: any = { token: 'jwt' }
      authManagerMock.setCookies.mockResolvedValueOnce(loginDto)

      // cover: usersManager.updateAccesses.catch(...) should log an error when updateAccesses rejects
      const logErrorSpy = jest.spyOn((service as any).logger, 'error').mockImplementation(() => undefined as any)
      usersManagerMock.updateAccesses.mockRejectedValueOnce(new Error('updateAccesses boom'))

      const result = await service.linkAccess(identity, link.uuid, req, res)

      expect(result).toBe(loginDto)
      expect(usersManagerMock.updateAccesses).toHaveBeenCalledWith(expect.anything(), req.ip, true)
      expect(authManagerMock.setCookies).toHaveBeenCalled()
      // additionally cover the "space truthy" branch by calling the private helper directly
      // should call spacesManager.spaceEnv with FILES and space alias when link.space is truthy
      await (service as any).spaceEnvFromLink(new UserModel(link.user as any), spaceLink as any)
      expect(spacesManagerMock.spaceEnv).toHaveBeenCalledWith(expect.anything(), ['files', 'files'])
      // should log error when updateAccesses fails
      expect(logErrorSpy).toHaveBeenCalled()
    })

    it('throws BAD_REQUEST when link is invalid', async () => {
      const disabledLink = { ...baseLink, user: { id: 7, login: 'john', isActive: false } }
      linksQueriesMock.linkFromUUID.mockResolvedValueOnce(disabledLink)

      await expect(service.linkAccess(identity, disabledLink.uuid, req, res)).rejects.toMatchObject({
        status: 400
      })
    })

    it('returns undefined for already authenticated directory access (same user) and does not set cookies or increment', async () => {
      const sameUserIdentity = { id: baseLink.user.id, login: 'john' }
      const link = { ...baseLink, requireAuth: true }
      linksQueriesMock.linkFromUUID.mockResolvedValueOnce(link)
      const spaceLink = {
        space: { alias: 'files', name: 'Space' },
        share: { isDir: true, name: 'dir', alias: 'share' }
      } as any
      linksQueriesMock.spaceLink.mockResolvedValueOnce(spaceLink)

      const result = await service.linkAccess(sameUserIdentity as any, link.uuid, req, res)

      expect(result).toBeUndefined()
      expect(authManagerMock.setCookies).not.toHaveBeenCalled()
      expect(linksQueriesMock.incrementLinkNbAccess).not.toHaveBeenCalled()
    })

    it('throws INTERNAL_SERVER_ERROR when file checks fail during streaming', async () => {
      const link = { ...baseLink, limitAccess: 10 }
      linksQueriesMock.linkFromUUID.mockResolvedValueOnce(link)
      const spaceLink = {
        space: null,
        share: { isDir: false, name: 'bad.txt', alias: 'share' }
      } as any
      linksQueriesMock.spaceLink.mockResolvedValueOnce(spaceLink)

      spacesManagerMock.spaceEnv.mockResolvedValueOnce({} as any)
      filesManagerMock.sendFileFromSpace.mockReturnValueOnce({
        checks: jest.fn().mockRejectedValueOnce(new Error('disk error')),
        stream: jest.fn()
      } as any)

      await expect(service.linkAccess(identity, link.uuid, req, res)).rejects.toMatchObject({
        status: 500
      })
      expect(linksQueriesMock.incrementLinkNbAccess).toHaveBeenCalledWith(link.uuid)
    })
  })

  describe('linkAuthentication', () => {
    const req: any = { ip: '10.0.0.1' }
    const res: any = {}

    it('returns cookies when password is correct', async () => {
      const link = { ...baseLink, requireAuth: true }
      linksQueriesMock.linkFromUUID.mockResolvedValueOnce(link)
      usersManagerMock.compareUserPassword.mockResolvedValueOnce(true)
      // usersManagerMock.updateAccesses.mockResolvedValueOnce(undefined) // removed to ensure rejection is hit
      const loginDto: any = { token: 'abc' }
      authManagerMock.setCookies.mockResolvedValueOnce(loginDto)

      // cover: usersManager.updateAccesses.catch(...) should log an error when updateAccesses rejects (success flow)
      const logErrorSpy = jest.spyOn((service as any).logger, 'error').mockImplementation(() => undefined as any)
      usersManagerMock.updateAccesses.mockRejectedValueOnce(new Error('updateAccesses auth success boom'))

      const result = await service.linkAuthentication(identity, link.uuid, { password: 'secret' } as any, req, res)

      expect(result).toBe(loginDto)
      expect(usersManagerMock.compareUserPassword).toHaveBeenCalledWith(link.user.id, 'secret')
      expect(usersManagerMock.updateAccesses).toHaveBeenCalledWith(expect.anything(), req.ip, true)
      expect(authManagerMock.setCookies).toHaveBeenCalled()
      // should log error when updateAccesses fails in successful authentication
      expect(logErrorSpy).toHaveBeenCalled()
    })

    it('throws FORBIDDEN when password is incorrect', async () => {
      const link = { ...baseLink, requireAuth: true }
      linksQueriesMock.linkFromUUID.mockResolvedValueOnce(link)
      usersManagerMock.compareUserPassword.mockResolvedValueOnce(false)
      usersManagerMock.updateAccesses.mockResolvedValueOnce(undefined)

      await expect(service.linkAuthentication(identity, link.uuid, { password: 'bad' } as any, req, res)).rejects.toMatchObject({ status: 403 })
    })

    it('throws BAD_REQUEST when link is invalid (e.g., expired)', async () => {
      const expired = { ...baseLink, expiresAt: new Date(Date.now() - 60_000) }
      linksQueriesMock.linkFromUUID.mockResolvedValueOnce(expired)

      await expect(service.linkAuthentication(identity, expired.uuid, { password: 'whatever' } as any, req, res)).rejects.toMatchObject({
        status: 400
      })
    })
  })
})
