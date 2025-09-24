/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpService } from '@nestjs/axios'
import { HttpStatus } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { FastifyReply } from 'fastify'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import { AuthMethod } from '../../../authentication/models/auth-method'
import { AuthManager } from '../../../authentication/services/auth-manager.service'
import { AuthMethod2FA } from '../../../authentication/services/auth-methods/auth-method-two-fa.service'
import * as commonFunctions from '../../../common/functions'
import * as commonShared from '../../../common/shared'
import { configuration } from '../../../configuration/config.environment'
import { Cache } from '../../../infrastructure/cache/services/cache.service'
import { isPathExists } from '../../files/utils/files'
import { UserModel } from '../../users/models/user.model'
import { UsersManager } from '../../users/services/users-manager.service'
import { CLIENT_AUTH_TYPE, CLIENT_TOKEN_EXPIRED_ERROR } from '../constants/auth'
import { APP_STORE_DIRNAME, APP_STORE_REPOSITORY } from '../constants/store'
import { SYNC_CLIENT_TYPE } from '../constants/sync'
import { SyncClientsManager } from './sync-clients-manager.service'
import { SyncQueries } from './sync-queries.service'

// Pilotage permission via UserModel
let mockHavePermission = true
jest.mock('../../users/models/user.model', () => ({
  UserModel: jest.fn().mockImplementation((props: any) => ({
    ...props,
    havePermission: () => mockHavePermission
  }))
}))

// Mock ciblé de convertHumanTimeToSeconds
jest.mock('../../../common/functions', () => {
  const actual = jest.requireActual('../../../common/functions')
  return { ...actual, convertHumanTimeToSeconds: jest.fn() }
})

// Mock currentTimeStamp
jest.mock('../../../common/shared', () => ({ currentTimeStamp: jest.fn() }))

// Mock FS et helper d'existence
jest.mock('node:fs/promises', () => ({ readFile: jest.fn() }))
jest.mock('../../files/utils/files', () => ({ isPathExists: jest.fn() }))

describe(SyncClientsManager.name, () => {
  let service: SyncClientsManager

  // Mocks
  let http: { axiosRef: jest.Mock }
  let authManager: { setCookies: jest.Mock; getTokens: jest.Mock }
  let authMethod: { validateUser: jest.Mock }
  let usersManager: { fromUserId: jest.Mock; updateAccesses: jest.Mock }
  let syncQueries: {
    getOrCreateClient: jest.Mock
    deleteClient: jest.Mock
    getClient: jest.Mock
    updateClientInfo: jest.Mock
    renewClientTokenAndExpiration: jest.Mock
    getClients: jest.Mock
  }
  let cacheMock: { genSlugKey: jest.Mock; get: jest.Mock; set: jest.Mock; del: jest.Mock }

  // Helpers
  const setRepo = (repo: APP_STORE_REPOSITORY) => {
    ;(configuration as any).applications.appStore.repository = repo
  }
  const makeClient = (overrides: any = {}) => ({
    id: 'cid',
    ownerId: 1,
    tokenExpiration: 2000,
    enabled: true,
    info: { type: 'desktop' },
    ...overrides
  })
  const makeUser = (overrides: any = {}) =>
    new UserModel({
      id: 1,
      isActive: true,
      login: 'u',
      email: 'u@x',
      firstName: 'U',
      lastName: 'X',
      role: 1,
      permissions: 'desktop',
      ...overrides
    })

  beforeAll(async () => {
    http = { axiosRef: jest.fn() }
    authManager = { setCookies: jest.fn(), getTokens: jest.fn() }
    authMethod = { validateUser: jest.fn() }
    usersManager = { fromUserId: jest.fn(), updateAccesses: jest.fn() }
    syncQueries = {
      getOrCreateClient: jest.fn(),
      deleteClient: jest.fn(),
      getClient: jest.fn(),
      updateClientInfo: jest.fn(),
      renewClientTokenAndExpiration: jest.fn(),
      getClients: jest.fn()
    }
    cacheMock = {
      genSlugKey: jest.fn().mockReturnValue('syncclientsmanager:checkappstore'),
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined)
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncClientsManager,
        { provide: Cache, useValue: cacheMock },
        { provide: HttpService, useValue: http },
        { provide: SyncQueries, useValue: syncQueries },
        { provide: UsersManager, useValue: usersManager },
        { provide: AuthManager, useValue: authManager },
        { provide: AuthMethod, useValue: authMethod },
        { provide: AuthMethod2FA, useValue: {} }
      ]
    }).compile()

    module.useLogger(['fatal'])
    service = module.get<SyncClientsManager>(SyncClientsManager)
    ;(service as any).cache = cacheMock
  })

  beforeEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
    mockHavePermission = true
    ;(commonShared.currentTimeStamp as jest.Mock).mockReturnValue(1_000)
    ;(commonFunctions.convertHumanTimeToSeconds as jest.Mock).mockImplementation((v: string | number) => {
      if (v === '90d') return 90 * 24 * 3600
      if (v === '180d') return 180 * 24 * 3600
      if (typeof v === 'number') return v
      return 0
    })
    ;(isPathExists as jest.Mock).mockReset()
    ;(fs.readFile as jest.Mock).mockReset()
    ;(syncQueries.updateClientInfo as jest.Mock).mockResolvedValue(undefined)
    ;(usersManager.updateAccesses as jest.Mock).mockResolvedValue(undefined)
    ;(service as any).cache = cacheMock
    cacheMock.get.mockResolvedValue(undefined)
    cacheMock.get.mockClear()
    cacheMock.set.mockClear()
    cacheMock.del.mockClear()
    cacheMock.genSlugKey.mockClear()
    setRepo(APP_STORE_REPOSITORY.PUBLIC)
  })

  it('should be defined', () => expect(service).toBeDefined())

  describe('register', () => {
    const baseDto = { login: 'john', password: 'secret', clientId: 'client-1', info: { type: 'desktop', version: '1.0.0' } }

    test.each([
      ['Unauthorized when credentials are invalid', null, HttpStatus.UNAUTHORIZED],
      ['Forbidden when user lacks DESKTOP_APP permission', { id: 10, login: 'john', havePermission: () => false }, HttpStatus.FORBIDDEN]
    ])('should throw %s', async (_label, user, status) => {
      authMethod.validateUser.mockResolvedValue(user)
      await expect(service.register(baseDto as any, '1.2.3.4')).rejects.toMatchObject({ status })
    })

    it('should return client token when registration succeeds', async () => {
      authMethod.validateUser.mockResolvedValue({ id: 10, login: 'john', havePermission: () => true })
      syncQueries.getOrCreateClient.mockResolvedValue('token-abc')

      const r = await service.register(baseDto as any, '1.2.3.4')
      expect(r).toEqual({ clientToken: 'token-abc' })
      expect(syncQueries.getOrCreateClient).toHaveBeenCalledWith(10, 'client-1', baseDto.info, '1.2.3.4')
    })

    it('should throw Internal Server Error when persistence fails', async () => {
      authMethod.validateUser.mockResolvedValue({ id: 10, login: 'john', havePermission: () => true })
      syncQueries.getOrCreateClient.mockRejectedValue(new Error('db error'))
      await expect(service.register(baseDto as any, '1.2.3.4')).rejects.toMatchObject({ status: HttpStatus.INTERNAL_SERVER_ERROR })
    })
  })

  describe('unregister', () => {
    it('should delete client without error', async () => {
      syncQueries.deleteClient.mockResolvedValue(undefined)
      await expect(service.unregister({ id: 1, clientId: 'c1' } as any)).resolves.toBeUndefined()
      expect(syncQueries.deleteClient).toHaveBeenCalledWith(1, 'c1')
    })
    it('should throw Internal Server Error when deletion fails', async () => {
      syncQueries.deleteClient.mockRejectedValue(new Error('db error'))
      await expect(service.unregister({ id: 1, clientId: 'c1' } as any)).rejects.toMatchObject({ status: HttpStatus.INTERNAL_SERVER_ERROR })
    })
  })

  describe('authenticate', () => {
    const ip = '9.9.9.9'
    const dto = { clientId: 'cid', token: 'ctok' }

    it('should forbid when client is unknown', async () => {
      syncQueries.getClient.mockResolvedValue(undefined)
      await expect(service.authenticate(CLIENT_AUTH_TYPE.TOKEN, dto as any, ip, {} as FastifyReply)).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        response: 'Client is unknown'
      })
    })

    it('should forbid when client is disabled', async () => {
      syncQueries.getClient.mockResolvedValue(makeClient({ enabled: false, tokenExpiration: 5000 }))
      await expect(service.authenticate(CLIENT_AUTH_TYPE.TOKEN, dto as any, ip, {} as FastifyReply)).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        response: 'Client is disabled'
      })
    })

    it('should forbid when client token is expired', async () => {
      ;(commonShared.currentTimeStamp as jest.Mock).mockReturnValue(1000)
      syncQueries.getClient.mockResolvedValue(makeClient({ tokenExpiration: 1000 }))
      await expect(service.authenticate(CLIENT_AUTH_TYPE.TOKEN, dto as any, ip, {} as FastifyReply)).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        response: CLIENT_TOKEN_EXPIRED_ERROR
      })
    })

    it('should forbid when owner user does not exist', async () => {
      syncQueries.getClient.mockResolvedValue(makeClient())
      syncQueries.updateClientInfo.mockRejectedValueOnce(new Error('update-fails')) // silence expected
      usersManager.fromUserId.mockResolvedValue(null)
      await expect(service.authenticate(CLIENT_AUTH_TYPE.TOKEN, dto as any, ip, {} as FastifyReply)).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        response: 'User does not exist'
      })
    })

    it('should forbid when owner account is inactive', async () => {
      syncQueries.getClient.mockResolvedValue(makeClient())
      usersManager.fromUserId.mockResolvedValue(makeUser({ isActive: false }))
      await expect(service.authenticate(CLIENT_AUTH_TYPE.TOKEN, dto as any, ip, {} as FastifyReply)).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        response: 'Account suspended or not authorized'
      })
    })

    it('should forbid when owner lacks DESKTOP_APP permission', async () => {
      mockHavePermission = false
      syncQueries.getClient.mockResolvedValue(makeClient())
      usersManager.fromUserId.mockResolvedValue(makeUser({ permissions: '', role: 999 }))
      await expect(service.authenticate(CLIENT_AUTH_TYPE.TOKEN, dto as any, ip, {} as FastifyReply)).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        response: 'Missing permission'
      })
    })

    it('should perform COOKIE authentication and renew client token when needed', async () => {
      syncQueries.getClient.mockResolvedValue(makeClient({ ownerId: 7 }))
      usersManager.fromUserId.mockResolvedValue(makeUser({ id: 7, login: 'john', email: 'john@doe', firstName: 'John', lastName: 'Doe' }))
      usersManager.updateAccesses.mockRejectedValueOnce(new Error('update-access-fail')) // silence expected
      authManager.setCookies.mockResolvedValue({ access_token: 'a', refresh_token: 'b' })
      jest.spyOn(service, 'renewTokenAndExpiration').mockResolvedValue('new-client-token')

      const reply = {} as unknown as FastifyReply
      const r: any = await service.authenticate(CLIENT_AUTH_TYPE.COOKIE, dto as any, ip, reply)

      expect(authManager.setCookies).toHaveBeenCalledTimes(1)
      expect(service.renewTokenAndExpiration).toHaveBeenCalledTimes(1)
      expect(r.client_token_update).toBe('new-client-token')
    })

    it('should perform TOKEN authentication and not renew when not needed', async () => {
      syncQueries.getClient.mockResolvedValue(makeClient({ ownerId: 8 }))
      usersManager.fromUserId.mockResolvedValue(makeUser({ id: 8, login: 'alice', email: 'alice@doe', firstName: 'Alice' }))
      authManager.getTokens.mockResolvedValue({ access_token: 'x', refresh_token: 'y' })
      jest.spyOn(service, 'renewTokenAndExpiration').mockResolvedValue(undefined)

      const r: any = await service.authenticate(CLIENT_AUTH_TYPE.TOKEN, dto as any, ip, {} as FastifyReply)
      expect(authManager.getTokens).toHaveBeenCalledTimes(1)
      expect(r.client_token_update).toBeUndefined()
    })

    it('should throw when auth type is unknown (else branch)', async () => {
      syncQueries.getClient.mockResolvedValue(makeClient({ ownerId: 9 }))
      usersManager.fromUserId.mockResolvedValue(makeUser({ id: 9, login: 'bob', email: 'bob@doe', firstName: 'Bob' }))
      jest.spyOn(service, 'renewTokenAndExpiration').mockResolvedValue(undefined)
      await expect(service.authenticate('unknown' as any, { clientId: 'cid', token: 'ctok' } as any, ip, {} as FastifyReply)).rejects.toBeInstanceOf(
        TypeError
      )
    })
  })

  describe('getClients', () => {
    it('should proxy to SyncQueries.getClients', async () => {
      const fake = [{ id: 'c1', paths: [] }]
      syncQueries.getClients.mockResolvedValue(fake)
      const r = await service.getClients({ id: 1, clientId: 'c1' } as any)
      expect(r).toBe(fake)
      expect(syncQueries.getClients).toHaveBeenCalledWith({ id: 1, clientId: 'c1' })
    })
  })

  describe('renewTokenAndExpiration', () => {
    const owner = { id: 1, login: 'bob' } as any

    it('should return undefined when token expiration is far enough', async () => {
      ;(commonShared.currentTimeStamp as jest.Mock).mockReturnValue(1_000)
      ;(commonFunctions.convertHumanTimeToSeconds as jest.Mock).mockImplementation((v: string) => (v === '90d' ? 90 * 24 * 3600 : 0))
      const client = { id: 'cid', tokenExpiration: 1_000 + 90 * 24 * 3600 + 1 } as any
      expect(await service.renewTokenAndExpiration(client, owner)).toBeUndefined()
    })

    it('should renew token and return new value when close to expiration', async () => {
      ;(commonShared.currentTimeStamp as jest.Mock).mockReturnValue(1_000)
      ;(commonFunctions.convertHumanTimeToSeconds as jest.Mock).mockImplementation((v: string) =>
        v === '60d' ? 60 * 24 * 3600 : v === '120d' ? 120 * 24 * 3600 : 0
      )
      const client = { id: 'cid', tokenExpiration: 1_000 + 60 * 24 * 3600 - 1 } as any
      syncQueries.renewClientTokenAndExpiration.mockResolvedValue(undefined)

      const r = await service.renewTokenAndExpiration(client, owner)
      expect(typeof r).toBe('string')
      expect(r).toBeTruthy()
      expect(syncQueries.renewClientTokenAndExpiration).toHaveBeenCalledWith('cid', r, expect.any(Number))
    })

    it('should throw Bad Request when renewal persistence fails', async () => {
      ;(commonShared.currentTimeStamp as jest.Mock).mockReturnValue(1_000)
      const client = { id: 'cid', tokenExpiration: 1_000 } as any
      jest.spyOn(crypto, 'randomUUID').mockReturnValue('uuid-err' as any)
      syncQueries.renewClientTokenAndExpiration.mockRejectedValue(new Error('db fail'))
      await expect(service.renewTokenAndExpiration(client, owner)).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST })
    })
  })

  describe('deleteClient', () => {
    it('should delete client successfully', async () => {
      syncQueries.deleteClient.mockResolvedValue(undefined)
      await expect(service.deleteClient({ id: 5 } as any, 'cid')).resolves.toBeUndefined()
      expect(syncQueries.deleteClient).toHaveBeenCalledWith(5, 'cid')
    })
    it('should throw Internal Server Error when deletion fails', async () => {
      syncQueries.deleteClient.mockRejectedValue(new Error('db error'))
      await expect(service.deleteClient({ id: 5 } as any, 'cid')).rejects.toMatchObject({ status: HttpStatus.INTERNAL_SERVER_ERROR })
    })
  })

  describe('checkAppStore', () => {
    it('should return PUBLIC manifest when HTTP fetch succeeds', async () => {
      setRepo(APP_STORE_REPOSITORY.PUBLIC)
      http.axiosRef.mockResolvedValue({ data: { platform: { win: [] } } })

      const manifest: any = await service.checkAppStore()
      expect(manifest).toBeTruthy()
      expect(manifest.repository).toBe(APP_STORE_REPOSITORY.PUBLIC)
      expect(http.axiosRef).toHaveBeenCalled()
    })

    it('should return null when PUBLIC manifest fetch fails', async () => {
      setRepo(APP_STORE_REPOSITORY.PUBLIC)
      http.axiosRef.mockRejectedValue(new Error('network'))
      expect(await service.checkAppStore()).toBeNull()
    })

    it('should return null when LOCAL manifest file does not exist', async () => {
      setRepo(APP_STORE_REPOSITORY.LOCAL)
      ;(isPathExists as jest.Mock).mockResolvedValue(false)
      expect(await service.checkAppStore()).toBeNull()
    })

    it('should return LOCAL manifest with rewritten URLs when file is valid', async () => {
      setRepo(APP_STORE_REPOSITORY.LOCAL)
      ;(isPathExists as jest.Mock).mockResolvedValue(true)
      const raw = {
        platform: {
          win: [{ package: 'desktop-win.exe' }, { package: 'cli-win.zip' }],
          linux: [{ package: 'desktop-linux.AppImage' }]
        }
      }
      ;(fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(raw))

      const manifest: any = await service.checkAppStore()
      expect(manifest.repository).toBe(APP_STORE_REPOSITORY.LOCAL)
      expect(manifest.platform.win[0].url.startsWith(APP_STORE_DIRNAME)).toBe(true)
      expect(manifest.platform.win[0].url.endsWith('desktop-win.exe')).toBe(true)
      expect(manifest.platform.win[1].url.startsWith(APP_STORE_DIRNAME)).toBe(true)
      expect(manifest.platform.win[1].url.endsWith('cli-win.zip')).toBe(true)
      expect(manifest.platform.linux[0].url.startsWith(APP_STORE_DIRNAME)).toBe(true)
      expect(manifest.platform.linux[0].url.endsWith('desktop-linux.AppImage')).toBe(true)
    })

    it('should return null when LOCAL manifest cannot be parsed', async () => {
      setRepo(APP_STORE_REPOSITORY.LOCAL)
      ;(isPathExists as jest.Mock).mockResolvedValue(true)
      ;(fs.readFile as jest.Mock).mockRejectedValue(new Error('fs error'))
      expect(await service.checkAppStore()).toBeNull()
    })

    it('should rewrite desktop packages under desktop/os when package starts with "desktop"', async () => {
      setRepo(APP_STORE_REPOSITORY.LOCAL)
      ;(isPathExists as jest.Mock).mockResolvedValue(true)
      const raw = {
        platform: {
          win: [{ package: `${SYNC_CLIENT_TYPE.DESKTOP}-win.exe` }],
          mac: [{ package: `${SYNC_CLIENT_TYPE.DESKTOP}-mac.dmg` }],
          linux: [{ package: `${SYNC_CLIENT_TYPE.DESKTOP}-linux.AppImage` }]
        }
      }
      ;(fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(raw))

      const manifest: any = await service.checkAppStore()
      expect(manifest).toBeTruthy()
      expect(manifest.repository).toBe(APP_STORE_REPOSITORY.LOCAL)
      expect(manifest.platform.win[0].url).toBe(`${APP_STORE_DIRNAME}/${SYNC_CLIENT_TYPE.DESKTOP}/win/${SYNC_CLIENT_TYPE.DESKTOP}-win.exe`)
      expect(manifest.platform.mac[0].url).toBe(`${APP_STORE_DIRNAME}/${SYNC_CLIENT_TYPE.DESKTOP}/mac/${SYNC_CLIENT_TYPE.DESKTOP}-mac.dmg`)
      expect(manifest.platform.linux[0].url).toBe(`${APP_STORE_DIRNAME}/${SYNC_CLIENT_TYPE.DESKTOP}/linux/${SYNC_CLIENT_TYPE.DESKTOP}-linux.AppImage`)
    })
  })
})
