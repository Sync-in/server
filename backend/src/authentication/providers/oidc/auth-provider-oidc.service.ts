/*
 * Copyright (C) 2012-2026 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { FastifyReply, FastifyRequest } from 'fastify'
import {
  allowInsecureRequests,
  authorizationCodeGrant,
  AuthorizationResponseError,
  calculatePKCECodeChallenge,
  ClientSecretBasic,
  ClientSecretPost,
  Configuration,
  discovery,
  fetchUserInfo,
  IDToken,
  None,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
  skipSubjectCheck,
  UserInfoResponse
} from 'openid-client'
import { USER_ROLE } from '../../../applications/users/constants/user'
import type { CreateUserDto, UpdateUserDto } from '../../../applications/users/dto/create-or-update-user.dto'
import { UserModel } from '../../../applications/users/models/user.model'
import { AdminUsersManager } from '../../../applications/users/services/admin-users-manager.service'
import { UsersManager } from '../../../applications/users/services/users-manager.service'
import { generateShortUUID, splitFullName } from '../../../common/functions'
import { configuration } from '../../../configuration/config.environment'
import { AUTH_ROUTE } from '../../constants/routes'
import type { AUTH_SCOPE } from '../../constants/scope'
import { TOKEN_TYPE } from '../../interfaces/token.interface'
import { AUTH_PROVIDER } from '../auth-providers.constants'
import { AuthProvider } from '../auth-providers.models'
import { OAuthDesktopCallBackURI, OAuthDesktopLoopbackPorts, OAuthDesktopPortParam } from './auth-oidc-desktop.constants'
import type { AuthProviderOIDCConfig } from './auth-oidc.config'
import { OAuthCookie, OAuthCookieSettings, OAuthTokenEndpoint } from './auth-oidc.constants'

@Injectable()
export class AuthProviderOIDC implements AuthProvider {
  private readonly logger = new Logger(AuthProviderOIDC.name)
  private readonly oidcConfig: AuthProviderOIDCConfig = configuration.auth.oidc
  private frontendBaseUrl: string
  private config: Configuration = null

  constructor(
    private readonly usersManager: UsersManager,
    private readonly adminUsersManager: AdminUsersManager
  ) {}

  async validateUser(login: string, password: string, ip?: string, scope?: AUTH_SCOPE): Promise<UserModel> {
    // Local password authentication path (non-OIDC)
    const user: UserModel = await this.usersManager.findUser(login, false)

    if (!user) {
      return null
    }

    if (user.isGuest || user.isAdmin || scope || this.oidcConfig.options.enablePasswordAuth) {
      // Allow local password authentication for:
      // - guest users
      // - admin users (break-glass access)
      // - application scopes (app passwords)
      // - regular users when password authentication is enabled
      return this.usersManager.logUser(user, password, ip, scope)
    }

    return null
  }

  async getConfig(): Promise<Configuration> {
    if (!this.config) {
      this.config = await this.initializeOIDCClient()
    }
    return this.config
  }

  async getAuthorizationUrl(res: FastifyReply, desktopPort?: number): Promise<string> {
    const redirectURI = this.getRedirectURI(desktopPort)
    const config = await this.getConfig()

    // state: CSRF protection, nonce: binds the ID Token to this auth request (replay protection)
    const state = randomState()
    const nonce = randomNonce()

    const supportsPKCE = config.serverMetadata().supportsPKCE()
    const codeVerifier = supportsPKCE ? randomPKCECodeVerifier() : undefined

    const authUrl = new URL(config.serverMetadata().authorization_endpoint!)
    authUrl.searchParams.set('client_id', this.oidcConfig.clientId!)
    authUrl.searchParams.set('redirect_uri', redirectURI)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', this.oidcConfig.security.scope)
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('nonce', nonce)
    if (supportsPKCE) {
      const codeChallenge = await calculatePKCECodeChallenge(codeVerifier!)
      authUrl.searchParams.set('code_challenge', codeChallenge)
      authUrl.searchParams.set('code_challenge_method', 'S256')
    }

    // Avoid cache
    res
      .header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
      .header('Pragma', 'no-cache')
      .header('Expires', '0')
      .header('X-Robots-Tag', 'noindex, nofollow')
      .header('Referrer-Policy', 'no-referrer')

    // Store state, nonce, and codeVerifier in httpOnly cookies (expires in 10 minutes)
    res.setCookie(OAuthCookie.State, state, OAuthCookieSettings)
    res.setCookie(OAuthCookie.Nonce, nonce, OAuthCookieSettings)
    if (supportsPKCE) {
      res.setCookie(OAuthCookie.CodeVerifier, codeVerifier, OAuthCookieSettings)
    }
    return authUrl.toString()
  }

  async handleCallback(req: FastifyRequest, res: FastifyReply, query: Record<string, string>): Promise<UserModel> {
    const config = await this.getConfig()
    const supportsPKCE = config.serverMetadata().supportsPKCE()
    const [expectedState, expectedNonce, codeVerifier] = [
      req.cookies[OAuthCookie.State],
      req.cookies[OAuthCookie.Nonce],
      req.cookies[OAuthCookie.CodeVerifier]
    ]

    try {
      if (!expectedState?.length) {
        throw new HttpException('OAuth state is missing', HttpStatus.BAD_REQUEST)
      }

      if (supportsPKCE && !codeVerifier?.length) {
        throw new HttpException('OAuth code verifier is missing', HttpStatus.BAD_REQUEST)
      }

      const pkceCodeVerifier = supportsPKCE ? codeVerifier : undefined
      const callbackParams = new URLSearchParams(query)

      // Get Desktop Port if defined
      const desktopPort: string | null = callbackParams.get(OAuthDesktopPortParam)
      if (desktopPort) {
        callbackParams.delete(OAuthDesktopPortParam)
      }

      // Exchange authorization code for tokens
      const callbackUrl = new URL(this.getRedirectURI(desktopPort))
      callbackUrl.search = callbackParams.toString()
      const tokens = await authorizationCodeGrant(config, callbackUrl, {
        expectedState,
        pkceCodeVerifier,
        expectedNonce
      })

      // Get validated ID token claims
      const claims: IDToken = tokens.claims()
      if (!claims) {
        throw new HttpException('No ID token claims found', HttpStatus.BAD_REQUEST)
      }
      if (!claims.sub) {
        throw new HttpException('Unexpected profile response, no `sub`', HttpStatus.BAD_REQUEST)
      }

      // ID token claims may be minimal depending on the IdP; use the UserInfo endpoint to retrieve user details.
      // Get user info from the userinfo endpoint (requires access token and subject from ID token).
      const subject = this.oidcConfig.security.skipSubjectCheck ? skipSubjectCheck : claims.sub
      const userInfo: UserInfoResponse = await fetchUserInfo(config, tokens.access_token, subject)

      if (!userInfo.sub) {
        throw new Error('Unexpected profile response, no `sub`')
      }

      // Process the user info and create/update the user
      return await this.processUserInfo(userInfo, req.ip)
    } catch (error: AuthorizationResponseError | HttpException | any) {
      if (error instanceof AuthorizationResponseError) {
        this.logger.error(`${this.handleCallback.name} - OIDC callback error: ${error.code} - ${error.error_description}`)
        throw new HttpException(error.error_description, HttpStatus.BAD_REQUEST)
      } else {
        this.logger.error(`${this.handleCallback.name} - OIDC callback error: ${error}`)
        throw new HttpException(
          error.error_description ?? 'OIDC authentication failed',
          error instanceof HttpException ? error.getStatus() : (error.status ?? HttpStatus.INTERNAL_SERVER_ERROR)
        )
      }
    } finally {
      // Always clear temporary OIDC cookies (success or failure)
      Object.values(OAuthCookie).forEach((value) => {
        res.clearCookie(value, { path: '/' })
      })
    }
  }

  getRedirectCallbackUrl(accessExpiration: number, refreshExpiration: number) {
    if (!this.frontendBaseUrl) {
      const url = new URL(this.oidcConfig.redirectUri)
      const apiIndex = url.pathname.indexOf(AUTH_ROUTE.BASE)
      this.frontendBaseUrl = apiIndex >= 0 ? `${url.origin}${url.pathname.slice(0, apiIndex)}` : url.origin
    }
    const url = new URL(this.frontendBaseUrl)
    const params = new URLSearchParams({
      [AUTH_PROVIDER.OIDC]: 'true',
      [`${TOKEN_TYPE.ACCESS}_expiration`]: `${accessExpiration}`,
      [`${TOKEN_TYPE.REFRESH}_expiration`]: `${refreshExpiration}`
    })
    url.hash = `/?${params.toString()}`
    return url.toString()
  }

  getRedirectURI(desktopPort?: number | string): string {
    // web / default callback
    if (!desktopPort) return this.oidcConfig.redirectUri
    // desktop app callback
    if (typeof desktopPort === 'string') {
      desktopPort = Number(desktopPort)
    }
    if (!Number.isInteger(desktopPort) || !OAuthDesktopLoopbackPorts.has(desktopPort)) {
      throw new HttpException('Invalid desktop_port', HttpStatus.BAD_REQUEST)
    }
    // The redirect url must be known from provider
    return `http://127.0.0.1:${desktopPort}${OAuthDesktopCallBackURI}`
  }

  private async initializeOIDCClient(): Promise<Configuration> {
    try {
      const issuerUrl = new URL(this.oidcConfig.issuerUrl)
      const config: Configuration = await discovery(
        issuerUrl,
        this.oidcConfig.clientId,
        {
          client_secret: this.oidcConfig.clientSecret,
          response_types: ['code'],
          id_token_signed_response_alg: this.oidcConfig.security.tokenSigningAlg,
          userinfo_signed_response_alg: this.oidcConfig.security.userInfoSigningAlg
        },
        this.getTokenAuthMethod(this.oidcConfig.security.tokenEndpointAuthMethod, this.oidcConfig.clientSecret),
        {
          execute: [allowInsecureRequests],
          timeout: 6000
        }
      )
      this.logger.log(`${this.initializeOIDCClient.name} - OIDC client initialized successfully for issuer: ${this.oidcConfig.issuerUrl}`)
      return config
    } catch (error) {
      this.logger.error(`${this.initializeOIDCClient.name} - OIDC client initialization failed: ${error?.cause || error}`)
      switch (error.cause?.code) {
        case 'ECONNREFUSED':
        case 'ENOTFOUND':
          throw new HttpException('OIDC provider unavailable', HttpStatus.SERVICE_UNAVAILABLE)

        case 'ETIMEDOUT':
          throw new HttpException('OIDC provider timeout', HttpStatus.GATEWAY_TIMEOUT)

        default:
          throw new HttpException('OIDC client initialization failed', HttpStatus.INTERNAL_SERVER_ERROR)
      }
    }
  }

  private getTokenAuthMethod(tokenEndpointAuthMethod: OAuthTokenEndpoint, clientSecret?: string) {
    if (!clientSecret) {
      return None()
    }

    switch (tokenEndpointAuthMethod) {
      case OAuthTokenEndpoint.ClientSecretPost: {
        return ClientSecretPost(clientSecret)
      }

      case OAuthTokenEndpoint.ClientSecretBasic: {
        return ClientSecretBasic(clientSecret)
      }

      default: {
        return None()
      }
    }
  }

  private async processUserInfo(userInfo: UserInfoResponse, ip?: string): Promise<UserModel> {
    // Extract user information
    const { login, email } = this.extractLoginAndEmail(userInfo)

    // Check if user exists
    let user: UserModel = await this.usersManager.findUser(email || login, false)

    if (!user && !this.oidcConfig.options.autoCreateUser) {
      this.logger.warn(`${this.validateUser.name} - User not found and autoCreateUser is disabled`)
      throw new HttpException('User not found', HttpStatus.UNAUTHORIZED)
    }

    // Determine if user should be admin based on groups/roles
    const isAdmin = this.checkAdminRole(userInfo)

    // Create identity
    const identity = this.createIdentity(login, email, userInfo, isAdmin)

    // Create or update user
    user = await this.updateOrCreateUser(identity, user)

    // Update user access log
    this.usersManager.updateAccesses(user, ip, true).catch((e: Error) => this.logger.error(`${this.processUserInfo.name} : ${e}`))

    return user
  }

  private checkAdminRole(userInfo: UserInfoResponse): boolean {
    if (!this.oidcConfig.options.adminRoleOrGroup) {
      return false
    }

    // Check claims
    const claims = [...(Array.isArray(userInfo.groups) ? userInfo.groups : []), ...(Array.isArray(userInfo.roles) ? userInfo.roles : [])]

    return claims.includes(this.oidcConfig.options.adminRoleOrGroup)
  }

  private createIdentity(
    login: string,
    email: string,
    userInfo: UserInfoResponse,
    isAdmin: boolean
  ): Omit<CreateUserDto, 'password'> & { password?: string } {
    // Get first name and last name
    let firstName = userInfo.given_name || ''
    let lastName = userInfo.family_name || ''

    // If structured names not available, try to split the full name
    if (!firstName && !lastName && userInfo.name) {
      const names = splitFullName(userInfo.name)
      firstName = names.firstName
      lastName = names.lastName
    }

    return {
      login,
      email,
      role: isAdmin ? USER_ROLE.ADMINISTRATOR : USER_ROLE.USER,
      firstName,
      lastName
    }
  }

  private async updateOrCreateUser(identity: Omit<CreateUserDto, 'password'> & { password?: string }, user: UserModel | null): Promise<UserModel> {
    if (user === null) {
      // Create new user with a random password (required by the system but not used for OIDC login)
      const userWithPassword = {
        ...identity,
        password: generateShortUUID(24),
        permissions: this.oidcConfig.options.autoCreatePermissions.join(',')
      } as CreateUserDto
      const createdUser = await this.adminUsersManager.createUserOrGuest(userWithPassword, identity.role)
      const freshUser = await this.usersManager.fromUserId(createdUser.id)
      if (!freshUser) {
        this.logger.error(`${this.updateOrCreateUser.name} - user was not found : ${createdUser.login} (${createdUser.id})`)
        throw new HttpException('User not found', HttpStatus.NOT_FOUND)
      }
      return freshUser
    }

    // Check if user information has changed (excluding password)
    const identityHasChanged: UpdateUserDto = Object.fromEntries(
      Object.keys(identity)
        .filter((key) => key !== 'password')
        .map((key: string) => (identity[key] !== user[key] ? [key, identity[key]] : null))
        .filter(Boolean)
    )

    if (Object.keys(identityHasChanged).length > 0) {
      try {
        if (identityHasChanged?.role != null) {
          if (user.role === USER_ROLE.ADMINISTRATOR && !this.oidcConfig.options.adminRoleOrGroup) {
            // Prevent removing the admin role when adminGroup was removed or not defined
            delete identityHasChanged.role
          }
        }

        // Update user properties
        await this.adminUsersManager.updateUserOrGuest(user.id, identityHasChanged)

        // Update local user object
        Object.assign(user, identityHasChanged)

        if ('lastName' in identityHasChanged || 'firstName' in identityHasChanged) {
          // Force fullName update in the current user model
          user.setFullName(true)
        }
      } catch (e) {
        this.logger.warn(`${this.updateOrCreateUser.name} - unable to update user *${user.login}* : ${e}`)
      }
    }

    return user
  }

  private extractLoginAndEmail(userInfo: UserInfoResponse) {
    const email = userInfo.email ? userInfo.email.trim() : undefined
    if (!email) {
      throw new HttpException('No email address found in the OIDC profile', HttpStatus.BAD_REQUEST)
    }

    const login = userInfo.preferred_username ?? (email ? email.split('@')[0] : undefined) ?? userInfo.sub
    if (!login) {
      throw new HttpException('Unable to determine the OIDC profile login', HttpStatus.BAD_REQUEST)
    }

    return { login: login.trim().toLowerCase(), email }
  }
}
