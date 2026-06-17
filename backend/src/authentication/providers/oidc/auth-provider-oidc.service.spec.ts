import { HttpStatus } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { Test, TestingModule } from '@nestjs/testing'
import {
  allowInsecureRequests,
  authorizationCodeGrant,
  AuthorizationResponseError,
  calculatePKCECodeChallenge,
  discovery,
  fetchUserInfo,
  randomNonce,
  randomPKCECodeVerifier,
  randomState
} from 'openid-client'
import { USER_ROLE } from '../../../applications/users/constants/user'
import { UserModel } from '../../../applications/users/models/user.model'
import { AdminUsersManager } from '../../../applications/users/services/admin-users-manager.service'
import { UsersManager } from '../../../applications/users/services/users-manager.service'
import * as avatarUtils from '../../../applications/users/utils/avatar'
import * as filesUtils from '../../../applications/files/utils/files'
import { DownloadFile } from '../../../applications/files/utils/download-file'
import * as imageUtils from '../../../common/image'
import { DEFAULT_STORAGE_QUOTA_FIELD } from '../auth-providers.constants'
import { OAuthCookie } from './auth-oidc.constants'
import { AuthProviderOIDC } from './auth-provider-oidc.service'
import { Mock } from 'vitest'

vi.mock('../../../configuration/config.environment', () => ({
  configuration: {
    auth: {
      oidc: {
        issuerUrl: 'https://issuer.example.test',
        clientId: 'client-id',
        clientSecret: 'client-secret',
        redirectUri: 'https://api.example.test/auth/oidc/callback',
        security: {
          scope: 'openid profile email',
          supportPKCE: true,
          tokenSigningAlg: 'RS256',
          userInfoSigningAlg: 'RS256',
          tokenEndpointAuthMethod: 'client_secret_basic',
          allowInsecureRequests: false,
          skipSubjectCheck: false,
          allowPrivateIpAvatarDownload: false
        },
        options: {
          enablePasswordAuth: false,
          autoCreateUser: true,
          autoSyncAvatar: false,
          adminRoleOrGroup: 'admins',
          autoCreatePermissions: ['read']
        }
      }
    }
  }
}))

vi.mock('openid-client', () => {
  class AuthorizationResponseError extends Error {
    code: string
    error_description: string
    constructor(message: string, options: { cause: URLSearchParams }) {
      super(message)
      this.code = 'authorization_response_error'
      this.error_description = options?.cause?.get('error_description') ?? message
    }
  }

  return {
    allowInsecureRequests: vi.fn(),
    authorizationCodeGrant: vi.fn(),
    AuthorizationResponseError,
    calculatePKCECodeChallenge: vi.fn(),
    ClientSecretBasic: vi.fn(),
    ClientSecretPost: vi.fn(),
    Configuration: class {},
    discovery: vi.fn(),
    fetchUserInfo: vi.fn(),
    IDToken: class {},
    None: vi.fn(),
    randomNonce: vi.fn(),
    randomPKCECodeVerifier: vi.fn(),
    randomState: vi.fn(),
    skipSubjectCheck: Symbol('skipSubjectCheck'),
    UserInfoResponse: class {}
  }
})

describe(AuthProviderOIDC.name, () => {
  let service: AuthProviderOIDC
  let usersManager: {
    findUser: Mock
    logUser: Mock
    updateAccesses: Mock
    fromUserId: Mock
  }
  let adminUsersManager: {
    createUserOrGuest: Mock
    updateUserOrGuest: Mock
  }
  let httpService: {
    axiosRef: Mock
  }

  const makeConfig = (supportsPKCE = true) => ({
    serverMetadata: () => ({
      supportsPKCE: () => supportsPKCE,
      authorization_endpoint: 'https://issuer.example.test/authorize'
    })
  })

  const makeReply = () => ({
    header: vi.fn().mockReturnThis(),
    setCookie: vi.fn(),
    clearCookie: vi.fn()
  })

  const codedError = (message: string, code: string) => Object.assign(new Error(message), { code })

  beforeAll(async () => {
    usersManager = {
      findUser: vi.fn(),
      logUser: vi.fn(),
      updateAccesses: vi.fn().mockResolvedValue(undefined),
      fromUserId: vi.fn()
    }
    adminUsersManager = {
      createUserOrGuest: vi.fn(),
      updateUserOrGuest: vi.fn()
    }
    httpService = {
      axiosRef: vi.fn()
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: HttpService, useValue: httpService },
        { provide: UsersManager, useValue: usersManager },
        { provide: AdminUsersManager, useValue: adminUsersManager },
        AuthProviderOIDC
      ]
    }).compile()

    module.useLogger(['fatal'])
    service = module.get<AuthProviderOIDC>(AuthProviderOIDC)
  })

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    ;(service as any).config = null
    ;(service as any).oidcConfig.security.supportPKCE = true
    ;(service as any).oidcConfig.security.allowInsecureRequests = false
    ;(service as any).oidcConfig.security.allowPrivateIpAvatarDownload = false
    ;(service as any).oidcConfig.options.autoSyncAvatar = false
  })

  it('returns null when user is not found', async () => {
    usersManager.findUser.mockResolvedValue(null)

    const result = await service.validateUser('john', 'secret')

    expect(result).toBeNull()
    expect(usersManager.findUser).toHaveBeenCalledWith('john', false)
    expect(usersManager.logUser).not.toHaveBeenCalled()
  })

  it('allows local password auth for guest users', async () => {
    const guestUser = { id: 1, isGuest: true, isAdmin: false } as any
    usersManager.findUser.mockResolvedValue(guestUser)
    usersManager.logUser.mockResolvedValue(guestUser)

    const result = await service.validateUser('guest', 'secret')

    expect(usersManager.logUser).toHaveBeenCalledWith(guestUser, 'secret', undefined, undefined)
    expect(result).toBe(guestUser)
  })

  it('does not allow insecure OIDC requests by default during discovery', async () => {
    vi.mocked(discovery).mockResolvedValue(makeConfig(true) as any)

    await service.getConfig()

    const discoveryOptions = vi.mocked(discovery).mock.calls[0][4] as Record<string, unknown>
    expect(discoveryOptions).toEqual(expect.objectContaining({ timeout: 6000 }))
    expect(discoveryOptions).not.toHaveProperty('execute')
  })

  it('allows insecure OIDC requests during discovery when explicitly enabled', async () => {
    ;(service as any).oidcConfig.security.allowInsecureRequests = true
    vi.mocked(discovery).mockResolvedValue(makeConfig(true) as any)

    await service.getConfig()

    const discoveryOptions = vi.mocked(discovery).mock.calls[0][4] as Record<string, unknown>
    expect(discoveryOptions).toEqual(expect.objectContaining({ execute: [allowInsecureRequests], timeout: 6000 }))
  })

  it('maps insecure OIDC discovery requests to BAD_REQUEST', async () => {
    vi.mocked(discovery).mockRejectedValue(codedError('only requests to HTTPS are allowed', 'OAUTH_HTTP_REQUEST_FORBIDDEN'))

    await expect(service.getConfig()).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      message: 'OIDC issuer URL must use HTTPS unless allowInsecureRequests is enabled'
    })
  })

  it('maps generic OAuth discovery errors to BAD_REQUEST', async () => {
    vi.mocked(discovery).mockRejectedValue(codedError('unexpected HTTP response status code', 'OAUTH_RESPONSE_IS_NOT_CONFORM'))

    await expect(service.getConfig()).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      message: 'OIDC provider configuration error'
    })
  })

  it('builds the authorization url with PKCE data and cookies', async () => {
    vi.spyOn(service, 'getConfig').mockResolvedValue(makeConfig(true) as any)
    vi.mocked(randomState).mockReturnValue('state-1')
    vi.mocked(randomNonce).mockReturnValue('nonce-1')
    vi.mocked(randomPKCECodeVerifier).mockReturnValue('verifier-1')
    vi.mocked(calculatePKCECodeChallenge).mockResolvedValue('challenge-1')
    const reply = makeReply()

    const authUrl = await service.getAuthorizationUrl(reply as any)

    expect(reply.header).toHaveBeenCalled()
    expect(reply.setCookie).toHaveBeenCalledWith(OAuthCookie.State, 'state-1', expect.any(Object))
    expect(reply.setCookie).toHaveBeenCalledWith(OAuthCookie.Nonce, 'nonce-1', expect.any(Object))
    expect(reply.setCookie).toHaveBeenCalledWith(OAuthCookie.CodeVerifier, 'verifier-1', expect.any(Object))
    const url = new URL(authUrl)
    expect(url.searchParams.get('code_challenge')).toBe('challenge-1')
    expect(url.searchParams.get('client_id')).toBe('client-id')
  })

  it('does not use PKCE when supportPKCE is false', async () => {
    ;(service as any).oidcConfig.security.supportPKCE = false
    vi.spyOn(service, 'getConfig').mockResolvedValue(makeConfig(true) as any)
    vi.mocked(randomState).mockReturnValue('state-1')
    vi.mocked(randomNonce).mockReturnValue('nonce-1')
    const reply = makeReply()

    const authUrl = await service.getAuthorizationUrl(reply as any)

    expect(randomPKCECodeVerifier).not.toHaveBeenCalled()
    expect(calculatePKCECodeChallenge).not.toHaveBeenCalled()
    expect(reply.setCookie).not.toHaveBeenCalledWith(OAuthCookie.CodeVerifier, expect.anything(), expect.any(Object))
    const url = new URL(authUrl)
    expect(url.searchParams.get('code_challenge')).toBeNull()
    ;(service as any).oidcConfig.security.supportPKCE = true
  })

  it('handles callback success and clears cookies', async () => {
    const config = makeConfig(true)
    vi.spyOn(service, 'getConfig').mockResolvedValue(config as any)
    const processSpy = vi.spyOn(service as any, 'processUserInfo').mockResolvedValue({ id: 7 } as any)
    vi.mocked(authorizationCodeGrant).mockResolvedValue({
      claims: () => ({ sub: 'subject-1' }),
      access_token: 'access-token'
    })
    vi.mocked(fetchUserInfo).mockResolvedValue({ sub: 'subject-1', email: 'a@b.c', preferred_username: 'alice' })
    const req = {
      cookies: {
        [OAuthCookie.State]: 'state-1',
        [OAuthCookie.Nonce]: 'nonce-1',
        [OAuthCookie.CodeVerifier]: 'verifier-1'
      },
      ip: '127.0.0.1'
    }
    const reply = makeReply()

    const result = await service.handleCallback(req as any, reply as any, { code: 'abc' })

    expect(result).toEqual({ id: 7 })
    expect(processSpy).toHaveBeenCalledWith({ sub: 'subject-1', email: 'a@b.c', preferred_username: 'alice' }, '127.0.0.1')
    expect(reply.clearCookie).toHaveBeenCalledWith(OAuthCookie.State, { path: '/' })
    expect(reply.clearCookie).toHaveBeenCalledWith(OAuthCookie.Nonce, { path: '/' })
    expect(reply.clearCookie).toHaveBeenCalledWith(OAuthCookie.CodeVerifier, { path: '/' })
  })

  it('rejects callback when state is missing', async () => {
    vi.spyOn(service, 'getConfig').mockResolvedValue(makeConfig(false) as any)
    const reply = makeReply()
    const req = { cookies: {}, ip: '127.0.0.1' }

    await expect(service.handleCallback(req as any, reply as any, { code: 'abc' })).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST })
    expect(reply.clearCookie).toHaveBeenCalledWith(OAuthCookie.State, { path: '/' })
  })

  it('maps AuthorizationResponseError to BAD_REQUEST', async () => {
    vi.spyOn(service, 'getConfig').mockResolvedValue(makeConfig(false) as any)
    vi.mocked(authorizationCodeGrant).mockRejectedValue(
      new AuthorizationResponseError('access_denied', {
        cause: new URLSearchParams('error=access_denied&error_description=No access')
      })
    )
    const req = {
      cookies: {
        [OAuthCookie.State]: 'state-1',
        [OAuthCookie.Nonce]: 'nonce-1'
      },
      ip: '127.0.0.1'
    }
    const reply = makeReply()

    await expect(service.handleCallback(req as any, reply as any, { code: 'abc' })).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      message: 'No access'
    })
  })

  it('builds the redirect callback url with token expirations', () => {
    const url = service.getRedirectCallbackUrl(10, 20)
    const parsed = new URL(url)
    expect(parsed.hash).toContain('access_expiration=10')
    expect(parsed.hash).toContain('refresh_expiration=20')
  })

  it('creates identities with admin role when claims match', async () => {
    usersManager.findUser.mockResolvedValue(null)
    adminUsersManager.createUserOrGuest.mockResolvedValue({ id: 10, login: 'bob' })
    usersManager.fromUserId.mockResolvedValue({ id: 10, role: USER_ROLE.ADMINISTRATOR, login: 'bob', setFullName: vi.fn() } as any)
    const userInfo = { sub: 'x', email: 'b@c.d', preferred_username: 'bob', groups: ['admins'] }

    const result = await (service as any).processUserInfo(userInfo, '127.0.0.1')

    expect(adminUsersManager.createUserOrGuest).toHaveBeenCalledWith(
      expect.objectContaining({ role: USER_ROLE.ADMINISTRATOR }),
      USER_ROLE.ADMINISTRATOR
    )
    expect(result.role).toBe(USER_ROLE.ADMINISTRATOR)
  })

  it('does not sync the user avatar by default', async () => {
    const existingUser = { id: 20, login: 'alice', email: 'alice@example.org', role: USER_ROLE.USER, setFullName: vi.fn() } as any
    usersManager.findUser.mockResolvedValue(existingUser)
    const updatePictureUrlSpy = vi.spyOn(service as any, 'updatePictureUrl').mockResolvedValue(undefined)

    await (service as any).processUserInfo(
      { sub: 'x', email: 'alice@example.org', preferred_username: 'alice', picture: 'https://cdn.example.test/avatar.jpg' },
      '127.0.0.1'
    )

    expect(updatePictureUrlSpy).not.toHaveBeenCalled()
  })

  it('syncs the user avatar when enabled', async () => {
    ;(service as any).oidcConfig.options.autoSyncAvatar = true
    const existingUser = { id: 21, login: 'alice', email: 'alice@example.org', role: USER_ROLE.USER, setFullName: vi.fn() } as any
    const userInfo = { sub: 'x', email: 'alice@example.org', preferred_username: 'alice', picture: 'https://cdn.example.test/avatar.jpg' }
    usersManager.findUser.mockResolvedValue(existingUser)
    const updatePictureUrlSpy = vi.spyOn(service as any, 'updatePictureUrl').mockResolvedValue(undefined)

    await (service as any).processUserInfo(userInfo, '127.0.0.1')

    expect(updatePictureUrlSpy).toHaveBeenCalledWith(existingUser, userInfo)
  })

  it('handles storage quota claim mapping cases', async () => {
    const scenarios = [
      {
        mode: 'create',
        claimName: DEFAULT_STORAGE_QUOTA_FIELD,
        profile: { sub: 'x', email: 'sam@c.d', preferred_username: 'sam', [DEFAULT_STORAGE_QUOTA_FIELD]: '2048' },
        expectedQuota: 2048
      },
      {
        mode: 'create',
        claimName: DEFAULT_STORAGE_QUOTA_FIELD,
        profile: { sub: 'x', email: 'sam0@c.d', preferred_username: 'sam0', [DEFAULT_STORAGE_QUOTA_FIELD]: 0 },
        expectedQuota: null
      },
      {
        mode: 'create',
        claimName: 'quotaBytes',
        profile: { sub: 'x', email: 'samq@c.d', preferred_username: 'samq', quotaBytes: '4096' },
        expectedQuota: 4096
      },
      {
        mode: 'update',
        claimName: DEFAULT_STORAGE_QUOTA_FIELD,
        profile: { sub: 'x', email: 'alice@example.org', preferred_username: 'alice' },
        expectedUpdate: false
      },
      {
        mode: 'update',
        claimName: DEFAULT_STORAGE_QUOTA_FIELD,
        profile: { sub: 'x', email: 'alice@example.org', preferred_username: 'alice', [DEFAULT_STORAGE_QUOTA_FIELD]: null },
        expectedUpdate: true,
        expectedQuota: null
      },
      {
        mode: 'update',
        claimName: DEFAULT_STORAGE_QUOTA_FIELD,
        profile: { sub: 'x', email: 'alice@example.org', preferred_username: 'alice', [DEFAULT_STORAGE_QUOTA_FIELD]: 'invalid' },
        expectedUpdate: false
      },
      {
        mode: 'update',
        claimName: DEFAULT_STORAGE_QUOTA_FIELD,
        profile: { sub: 'x', email: 'alice@example.org', preferred_username: 'alice', [DEFAULT_STORAGE_QUOTA_FIELD]: '9007199254740992' },
        expectedUpdate: false
      }
    ] as const

    const originalStorageQuotaClaim = (service as any).oidcConfig.options.storageQuotaClaim
    try {
      for (const [index, scenario] of scenarios.entries()) {
        vi.clearAllMocks()
        ;(service as any).oidcConfig.options.storageQuotaClaim = scenario.claimName

        if (scenario.mode === 'create') {
          const id = 110 + index
          usersManager.findUser.mockResolvedValue(null)
          adminUsersManager.createUserOrGuest.mockResolvedValue({ id, login: `user-${id}` })
          usersManager.fromUserId.mockResolvedValue({ id, role: USER_ROLE.USER, login: `user-${id}`, setFullName: vi.fn() } as any)

          await (service as any).processUserInfo(scenario.profile, '127.0.0.1')

          expect(adminUsersManager.createUserOrGuest).toHaveBeenCalledWith(
            expect.objectContaining({ storageQuota: scenario.expectedQuota }),
            USER_ROLE.USER
          )
          continue
        }

        const existingUser = {
          id: 210 + index,
          login: 'alice',
          email: 'alice@example.org',
          role: USER_ROLE.USER,
          firstName: '',
          lastName: '',
          storageQuota: 4096,
          setFullName: vi.fn()
        } as any
        usersManager.findUser.mockResolvedValue(existingUser)

        await (service as any).processUserInfo(scenario.profile, '127.0.0.1')

        if (scenario.expectedUpdate) {
          expect(adminUsersManager.updateUserOrGuest).toHaveBeenCalledWith(
            existingUser.id,
            expect.objectContaining({ storageQuota: scenario.expectedQuota })
          )
        } else {
          expect(adminUsersManager.updateUserOrGuest).not.toHaveBeenCalled()
        }
      }
    } finally {
      ;(service as any).oidcConfig.options.storageQuotaClaim = originalStorageQuotaClaim
    }
  })

  describe('updatePictureUrl', () => {
    const oidcUser = { login: 'alice', tmpPath: '/tmp/sync-in/alice/tmp' } as UserModel
    const userInfo = (picture = 'https://cdn.example.test/avatar.jpg') => ({ picture }) as any

    it('returns when picture url is invalid', async () => {
      const downloadSpy = vi.spyOn(DownloadFile.prototype, 'download')

      await (service as any).updatePictureUrl(oidcUser, userInfo('not-a-url'))

      expect(downloadSpy).not.toHaveBeenCalled()
    })

    it('stops when content type is not an image', async () => {
      const downloadSpy = vi.spyOn(DownloadFile.prototype, 'download').mockResolvedValueOnce({
        contentType: 'text/plain',
        contentLength: 123,
        lastModified: 'Mon, 01 Jan 2024 00:00:00 GMT'
      } as any)
      const convertSpy = vi.spyOn(imageUtils, 'convertTempImageToPng').mockResolvedValue(undefined)

      await (service as any).updatePictureUrl(oidcUser, userInfo())

      expect(downloadSpy).toHaveBeenCalledTimes(1)
      expect(convertSpy).not.toHaveBeenCalled()
    })

    it('skips update when avatar metadata is unchanged', async () => {
      const downloadSpy = vi.spyOn(DownloadFile.prototype, 'download').mockResolvedValueOnce({
        contentType: 'image/png',
        contentLength: 128,
        lastModified: 'Mon, 01 Jan 2024 00:00:00 GMT'
      } as any)
      vi.spyOn(avatarUtils, 'isAvatarMetadataUnchanged').mockResolvedValue(true)
      const convertSpy = vi.spyOn(imageUtils, 'convertTempImageToPng').mockResolvedValue(undefined)

      await (service as any).updatePictureUrl(oidcUser, userInfo())

      expect(downloadSpy).toHaveBeenCalledTimes(1)
      expect(convertSpy).not.toHaveBeenCalled()
    })

    it('downloads and converts avatar when checks pass', async () => {
      const downloadSpy = vi
        .spyOn(DownloadFile.prototype, 'download')
        .mockResolvedValueOnce({
          contentType: 'image/png',
          contentLength: 128,
          lastModified: 'Mon, 01 Jan 2024 00:00:00 GMT'
        } as any)
        .mockResolvedValueOnce(undefined as any)
      vi.spyOn(avatarUtils, 'isAvatarMetadataUnchanged').mockResolvedValue(false)
      vi.spyOn(filesUtils, 'fileSize').mockResolvedValue(1024)
      vi.spyOn(UserModel, 'getHomePath').mockReturnValue('/tmp/sync-in/users/alice')
      const convertSpy = vi.spyOn(imageUtils, 'convertTempImageToPng').mockResolvedValue(undefined)
      const metadataSpy = vi.spyOn(avatarUtils, 'saveAvatarMetadata').mockResolvedValue(undefined)

      await (service as any).updatePictureUrl(oidcUser, userInfo())

      expect(downloadSpy).toHaveBeenCalledTimes(2)
      expect(downloadSpy).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ url: 'https://cdn.example.test/avatar.jpg' }),
        '/tmp/sync-in/alice/tmp/avatar.png',
        { allowPrivateIP: false, maxSize: avatarUtils.USER_AVATAR_MAX_UPLOAD_SIZE }
      )
      expect(convertSpy).toHaveBeenCalledWith('/tmp/sync-in/alice/tmp/avatar.png', '/tmp/sync-in/users/alice/avatar.png')
      expect(metadataSpy).toHaveBeenCalledWith('alice', 'https://cdn.example.test/avatar.jpg', 128, 'Mon, 01 Jan 2024 00:00:00 GMT')
    })

    it('allows private IP avatar downloads when explicitly enabled', async () => {
      ;(service as any).oidcConfig.security.allowPrivateIpAvatarDownload = true
      const downloadSpy = vi
        .spyOn(DownloadFile.prototype, 'download')
        .mockResolvedValueOnce({
          contentType: 'image/png',
          contentLength: 128,
          lastModified: 'Mon, 01 Jan 2024 00:00:00 GMT'
        } as any)
        .mockResolvedValueOnce(undefined as any)
      vi.spyOn(avatarUtils, 'isAvatarMetadataUnchanged').mockResolvedValue(false)
      vi.spyOn(filesUtils, 'fileSize').mockResolvedValue(1024)
      vi.spyOn(UserModel, 'getHomePath').mockReturnValue('/tmp/sync-in/users/alice')
      vi.spyOn(imageUtils, 'convertTempImageToPng').mockResolvedValue(undefined)

      await (service as any).updatePictureUrl(oidcUser, userInfo())

      expect(downloadSpy).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ url: 'https://cdn.example.test/avatar.jpg' }),
        '/tmp/sync-in/alice/tmp/avatar.png',
        { allowPrivateIP: true, getContentInfo: true }
      )
      expect(downloadSpy).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ url: 'https://cdn.example.test/avatar.jpg' }),
        '/tmp/sync-in/alice/tmp/avatar.png',
        { allowPrivateIP: true, maxSize: avatarUtils.USER_AVATAR_MAX_UPLOAD_SIZE }
      )
    })

    it('downloads avatar when content length is missing and stores the actual downloaded size', async () => {
      const downloadSpy = vi
        .spyOn(DownloadFile.prototype, 'download')
        .mockResolvedValueOnce({
          contentType: 'image/png',
          contentLength: null,
          lastModified: 'Mon, 01 Jan 2024 00:00:00 GMT'
        } as any)
        .mockResolvedValueOnce(undefined as any)
      const metadataUnchangedSpy = vi.spyOn(avatarUtils, 'isAvatarMetadataUnchanged').mockResolvedValue(false)
      vi.spyOn(filesUtils, 'fileSize').mockResolvedValue(1024)
      vi.spyOn(UserModel, 'getHomePath').mockReturnValue('/tmp/sync-in/users/alice')
      const convertSpy = vi.spyOn(imageUtils, 'convertTempImageToPng').mockResolvedValue(undefined)
      const metadataSpy = vi.spyOn(avatarUtils, 'saveAvatarMetadata').mockResolvedValue(undefined)

      await (service as any).updatePictureUrl(oidcUser, userInfo())

      expect(downloadSpy).toHaveBeenCalledTimes(2)
      expect(metadataUnchangedSpy).not.toHaveBeenCalled()
      expect(convertSpy).toHaveBeenCalledWith('/tmp/sync-in/alice/tmp/avatar.png', '/tmp/sync-in/users/alice/avatar.png')
      expect(metadataSpy).toHaveBeenCalledWith('alice', 'https://cdn.example.test/avatar.jpg', 1024, 'Mon, 01 Jan 2024 00:00:00 GMT')
    })

    it('stops after download when avatar size exceeds limit', async () => {
      const downloadSpy = vi
        .spyOn(DownloadFile.prototype, 'download')
        .mockResolvedValueOnce({
          contentType: 'image/png',
          contentLength: 128,
          lastModified: 'Mon, 01 Jan 2024 00:00:00 GMT'
        } as any)
        .mockResolvedValueOnce(undefined as any)
      vi.spyOn(avatarUtils, 'isAvatarMetadataUnchanged').mockResolvedValue(false)
      vi.spyOn(filesUtils, 'fileSize').mockResolvedValue(avatarUtils.USER_AVATAR_MAX_UPLOAD_SIZE + 1)
      const convertSpy = vi.spyOn(imageUtils, 'convertTempImageToPng').mockResolvedValue(undefined)

      await (service as any).updatePictureUrl(oidcUser, userInfo())

      expect(downloadSpy).toHaveBeenCalledTimes(2)
      expect(convertSpy).not.toHaveBeenCalled()
    })
  })
})
