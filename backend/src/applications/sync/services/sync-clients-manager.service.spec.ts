import { HttpService } from '@nestjs/axios'
import { HttpStatus } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { FastifyReply } from 'fastify'
import crypto from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { AuthManager } from '../../../authentication/auth.service'
import { AuthProvider } from '../../../authentication/providers/auth-providers.models'
import { AuthProvider2FA } from '../../../authentication/providers/two-fa/auth-provider-two-fa.service'
import * as commonFunctions from '../../../common/functions'
import * as commonShared from '../../../common/shared'
import { configuration } from '../../../configuration/config.environment'
import { Cache } from '../../../infrastructure/cache/cache.service'
import { isPathExists } from '../../files/utils/files'
import { UserModel } from '../../users/models/user.model'
import { UsersManager } from '../../users/services/users-manager.service'
import { CLIENT_AUTH_TYPE, CLIENT_TOKEN_EXPIRED_ERROR } from '../constants/auth'
import { APP_STORE_DIRNAME, APP_STORE_REPOSITORY } from '../constants/store'
import { SYNC_CLIENT_TYPE } from '../constants/sync'
import { SyncClientAuthRegistration } from '../interfaces/sync-client-auth.interface'
import { SyncClientsManager } from './sync-clients-manager.service'
import { SyncQueries } from './sync-queries.service'
import { Mock } from 'vitest'

// Pilotage permission via UserModel
let mockHavePermission = true
vi.mock('../../users/models/user.model', () => ({
  UserModel: vi.fn(function (props: any) {
    return {
      ...props,
      havePermission: () => mockHavePermission
    }
  })
}))

// Mock ciblé de convertHumanTimeToSeconds
vi.mock('../../../common/functions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../common/functions')>()
  return { ...actual, convertHumanTimeToSeconds: vi.fn() }
})

// Mock currentTimeStamp
vi.mock('../../../common/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../common/shared')>()
  return {
    ...actual,
    currentTimeStamp: vi.fn()
  }
})

// Mock FS et helper d'existence
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  const readFileMock = vi.fn()
  return {
    ...actual,
    readFile: readFileMock,
    default: {
      ...(actual as any).default,
      readFile: readFileMock
    }
  }
})

vi.mock('../../files/utils/files', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../files/utils/files')>()
  return {
    ...actual,
    isPathExists: vi.fn()
  }
})

describe(SyncClientsManager.name, () => {
  let service: SyncClientsManager

  // Mocks
  let http: { axiosRef: Mock }
  let authManager: { setCookies: Mock; getTokens: Mock }
  let authProvider: { validateUser: Mock }
  let usersManager: { fromUserId: Mock; updateAccesses: Mock }
  let syncQueries: {
    getOrCreateClient: Mock
    deleteClient: Mock
    getClient: Mock
    updateClientInfo: Mock
    renewClientTokenAndExpiration: Mock
    getClients: Mock
  }
  let cacheMock: { genSlugKey: Mock; get: Mock; set: Mock; del: Mock }

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
    http = { axiosRef: vi.fn() }
    authManager = { setCookies: vi.fn(), getTokens: vi.fn() }
    authProvider = { validateUser: vi.fn() }
    usersManager = { fromUserId: vi.fn(), updateAccesses: vi.fn() }
    syncQueries = {
      getOrCreateClient: vi.fn(),
      deleteClient: vi.fn(),
      getClient: vi.fn(),
      updateClientInfo: vi.fn(),
      renewClientTokenAndExpiration: vi.fn(),
      getClients: vi.fn()
    }
    cacheMock = {
      genSlugKey: vi.fn().mockReturnValue('syncclientsmanager:checkappstore'),
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(undefined),
      del: vi.fn().mockResolvedValue(undefined)
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncClientsManager,
        { provide: Cache, useValue: cacheMock },
        { provide: HttpService, useValue: http },
        { provide: SyncQueries, useValue: syncQueries },
        { provide: UsersManager, useValue: usersManager },
        { provide: AuthManager, useValue: authManager },
        { provide: AuthProvider, useValue: authProvider },
        { provide: AuthProvider2FA, useValue: {} }
      ]
    }).compile()

    module.useLogger(['fatal'])
    service = module.get<SyncClientsManager>(SyncClientsManager)
    ;(service as any).cache = cacheMock
  })

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    mockHavePermission = true
    vi.mocked(commonShared.currentTimeStamp).mockReturnValue(1_000)
    vi.mocked(commonFunctions.convertHumanTimeToSeconds).mockImplementation((v: string | number) => {
      if (v === '90d') return 90 * 24 * 3600
      if (v === '180d') return 180 * 24 * 3600
      if (typeof v === 'number') return v
      return 0
    })
    vi.mocked(isPathExists).mockReset()
    vi.mocked(readFile).mockReset()
    vi.mocked(syncQueries.updateClientInfo).mockResolvedValue(undefined)
    vi.mocked(usersManager.updateAccesses).mockResolvedValue(undefined)
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
      authProvider.validateUser.mockResolvedValue(user)
      await expect(service.register(baseDto as any, '1.2.3.4')).rejects.toMatchObject({ status })
    })

    it('should return client token when registration succeeds', async () => {
      authProvider.validateUser.mockResolvedValue({ id: 10, login: 'john', havePermission: () => true })
      syncQueries.getOrCreateClient.mockResolvedValue('token-abc')

      const r = await service.register(baseDto as any, '1.2.3.4')
      expect(r).toEqual({ clientId: 'client-1', clientToken: 'token-abc' } satisfies SyncClientAuthRegistration)
      expect(syncQueries.getOrCreateClient).toHaveBeenCalledWith(10, 'client-1', baseDto.info, '1.2.3.4')
    })

    it('should throw Internal Server Error when persistence fails', async () => {
      authProvider.validateUser.mockResolvedValue({ id: 10, login: 'john', havePermission: () => true })
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
      vi.mocked(commonShared.currentTimeStamp).mockReturnValue(1000)
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
      vi.spyOn(service, 'renewTokenAndExpiration').mockResolvedValue('new-client-token')

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
      vi.spyOn(service, 'renewTokenAndExpiration').mockResolvedValue(undefined)

      const r: any = await service.authenticate(CLIENT_AUTH_TYPE.TOKEN, dto as any, ip, {} as FastifyReply)
      expect(authManager.getTokens).toHaveBeenCalledTimes(1)
      expect(r.client_token_update).toBeUndefined()
    })

    it('should throw when auth type is unknown (else branch)', async () => {
      syncQueries.getClient.mockResolvedValue(makeClient({ ownerId: 9 }))
      usersManager.fromUserId.mockResolvedValue(makeUser({ id: 9, login: 'bob', email: 'bob@doe', firstName: 'Bob' }))
      vi.spyOn(service, 'renewTokenAndExpiration').mockResolvedValue(undefined)
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
      vi.mocked(commonShared.currentTimeStamp).mockReturnValue(1_000)
      vi.mocked(commonFunctions.convertHumanTimeToSeconds).mockImplementation((v: string) => (v === '90d' ? 90 * 24 * 3600 : 0))
      const client = { id: 'cid', tokenExpiration: 1_000 + 90 * 24 * 3600 + 1 } as any
      expect(await service.renewTokenAndExpiration(client, owner)).toBeUndefined()
    })

    it('should renew token and return new value when close to expiration', async () => {
      vi.mocked(commonShared.currentTimeStamp).mockReturnValue(1_000)
      vi.mocked(commonFunctions.convertHumanTimeToSeconds).mockImplementation((v: string) =>
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
      vi.mocked(commonShared.currentTimeStamp).mockReturnValue(1_000)
      const client = { id: 'cid', tokenExpiration: 1_000 } as any
      vi.spyOn(crypto, 'randomUUID').mockReturnValue('uuid-err' as any)
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
      vi.mocked(isPathExists).mockResolvedValue(false)
      expect(await service.checkAppStore()).toBeNull()
    })

    it('should return LOCAL manifest with rewritten URLs when file is valid', async () => {
      setRepo(APP_STORE_REPOSITORY.LOCAL)
      vi.mocked(isPathExists).mockResolvedValue(true)
      const raw = {
        platform: {
          win: [{ package: 'desktop-win.exe' }, { package: 'cli-win.zip' }],
          linux: [{ package: 'desktop-linux.AppImage' }]
        }
      }
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(raw))

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
      vi.mocked(isPathExists).mockResolvedValue(true)
      vi.mocked(readFile).mockRejectedValue(new Error('fs error'))
      expect(await service.checkAppStore()).toBeNull()
    })

    it('should rewrite desktop packages under desktop/os when package starts with "desktop"', async () => {
      setRepo(APP_STORE_REPOSITORY.LOCAL)
      vi.mocked(isPathExists).mockResolvedValue(true)
      const raw = {
        platform: {
          win: [{ package: `${SYNC_CLIENT_TYPE.DESKTOP}-win.exe` }],
          mac: [{ package: `${SYNC_CLIENT_TYPE.DESKTOP}-mac.dmg` }],
          linux: [{ package: `${SYNC_CLIENT_TYPE.DESKTOP}-linux.AppImage` }]
        }
      }
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(raw))

      const manifest: any = await service.checkAppStore()
      expect(manifest).toBeTruthy()
      expect(manifest.repository).toBe(APP_STORE_REPOSITORY.LOCAL)
      expect(manifest.platform.win[0].url).toBe(`${APP_STORE_DIRNAME}/${SYNC_CLIENT_TYPE.DESKTOP}/win/${SYNC_CLIENT_TYPE.DESKTOP}-win.exe`)
      expect(manifest.platform.mac[0].url).toBe(`${APP_STORE_DIRNAME}/${SYNC_CLIENT_TYPE.DESKTOP}/mac/${SYNC_CLIENT_TYPE.DESKTOP}-mac.dmg`)
      expect(manifest.platform.linux[0].url).toBe(`${APP_STORE_DIRNAME}/${SYNC_CLIENT_TYPE.DESKTOP}/linux/${SYNC_CLIENT_TYPE.DESKTOP}-linux.AppImage`)
    })
  })
})
