import { HttpStatus } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import {
  authorizationCodeGrant,
  AuthorizationResponseError,
  calculatePKCECodeChallenge,
  fetchUserInfo,
  randomNonce,
  randomPKCECodeVerifier,
  randomState
} from 'openid-client'
import { USER_ROLE } from '../../../applications/users/constants/user'
import { AdminUsersManager } from '../../../applications/users/services/admin-users-manager.service'
import { UsersManager } from '../../../applications/users/services/users-manager.service'
import { OAuthCookie } from './auth-oidc.constants'
import { AuthProviderOIDC } from './auth-provider-oidc.service'

jest.mock('../../../configuration/config.environment', () => ({
  configuration: {
    auth: {
      oidc: {
        issuerUrl: 'https://issuer.example.test',
        clientId: 'client-id',
        clientSecret: 'client-secret',
        redirectUri: 'https://api.example.test/auth/oidc/callback',
        security: {
          scope: 'openid profile email',
          tokenSigningAlg: 'RS256',
          userInfoSigningAlg: 'RS256',
          tokenEndpointAuthMethod: 'client_secret_basic',
          skipSubjectCheck: false
        },
        options: {
          enablePasswordAuth: false,
          autoCreateUser: true,
          adminRoleOrGroup: 'admins',
          autoCreatePermissions: ['read']
        }
      }
    }
  }
}))

jest.mock('openid-client', () => {
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
    allowInsecureRequests: jest.fn(),
    authorizationCodeGrant: jest.fn(),
    AuthorizationResponseError,
    calculatePKCECodeChallenge: jest.fn(),
    ClientSecretBasic: jest.fn(),
    ClientSecretPost: jest.fn(),
    Configuration: class {},
    discovery: jest.fn(),
    fetchUserInfo: jest.fn(),
    IDToken: class {},
    None: jest.fn(),
    randomNonce: jest.fn(),
    randomPKCECodeVerifier: jest.fn(),
    randomState: jest.fn(),
    skipSubjectCheck: Symbol('skipSubjectCheck'),
    UserInfoResponse: class {}
  }
})

describe(AuthProviderOIDC.name, () => {
  let service: AuthProviderOIDC
  let usersManager: {
    findUser: jest.Mock
    logUser: jest.Mock
    updateAccesses: jest.Mock
    fromUserId: jest.Mock
  }
  let adminUsersManager: {
    createUserOrGuest: jest.Mock
    updateUserOrGuest: jest.Mock
  }

  const makeConfig = (supportsPKCE = true) => ({
    serverMetadata: () => ({
      supportsPKCE: () => supportsPKCE,
      authorization_endpoint: 'https://issuer.example.test/authorize'
    })
  })

  const makeReply = () => ({
    header: jest.fn().mockReturnThis(),
    setCookie: jest.fn(),
    clearCookie: jest.fn()
  })

  beforeAll(async () => {
    usersManager = {
      findUser: jest.fn(),
      logUser: jest.fn(),
      updateAccesses: jest.fn().mockResolvedValue(undefined),
      fromUserId: jest.fn()
    }
    adminUsersManager = {
      createUserOrGuest: jest.fn(),
      updateUserOrGuest: jest.fn()
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [{ provide: UsersManager, useValue: usersManager }, { provide: AdminUsersManager, useValue: adminUsersManager }, AuthProviderOIDC]
    }).compile()

    module.useLogger(['fatal'])
    service = module.get<AuthProviderOIDC>(AuthProviderOIDC)
  })

  beforeEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
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

  it('builds the authorization url with PKCE data and cookies', async () => {
    jest.spyOn(service, 'getConfig').mockResolvedValue(makeConfig(true) as any)
    ;(randomState as jest.Mock).mockReturnValue('state-1')
    ;(randomNonce as jest.Mock).mockReturnValue('nonce-1')
    ;(randomPKCECodeVerifier as jest.Mock).mockReturnValue('verifier-1')
    ;(calculatePKCECodeChallenge as jest.Mock).mockResolvedValue('challenge-1')
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

  it('handles callback success and clears cookies', async () => {
    const config = makeConfig(true)
    jest.spyOn(service, 'getConfig').mockResolvedValue(config as any)
    const processSpy = jest.spyOn(service as any, 'processUserInfo').mockResolvedValue({ id: 7 } as any)
    ;(authorizationCodeGrant as jest.Mock).mockResolvedValue({
      claims: () => ({ sub: 'subject-1' }),
      access_token: 'access-token'
    })
    ;(fetchUserInfo as jest.Mock).mockResolvedValue({ sub: 'subject-1', email: 'a@b.c', preferred_username: 'alice' })
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
    jest.spyOn(service, 'getConfig').mockResolvedValue(makeConfig(false) as any)
    const reply = makeReply()
    const req = { cookies: {}, ip: '127.0.0.1' }

    await expect(service.handleCallback(req as any, reply as any, { code: 'abc' })).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST })
    expect(reply.clearCookie).toHaveBeenCalledWith(OAuthCookie.State, { path: '/' })
  })

  it('maps AuthorizationResponseError to BAD_REQUEST', async () => {
    jest.spyOn(service, 'getConfig').mockResolvedValue(makeConfig(false) as any)
    ;(authorizationCodeGrant as jest.Mock).mockRejectedValue(
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
    usersManager.fromUserId.mockResolvedValue({ id: 10, role: USER_ROLE.ADMINISTRATOR, login: 'bob', setFullName: jest.fn() } as any)
    const userInfo = { sub: 'x', email: 'b@c.d', preferred_username: 'bob', groups: ['admins'] }

    const result = await (service as any).processUserInfo(userInfo, '127.0.0.1')

    expect(adminUsersManager.createUserOrGuest).toHaveBeenCalledWith(
      expect.objectContaining({ role: USER_ROLE.ADMINISTRATOR }),
      USER_ROLE.ADMINISTRATOR
    )
    expect(result.role).toBe(USER_ROLE.ADMINISTRATOR)
  })
})
