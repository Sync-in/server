/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */
import { unsign, UnsignResult } from '@fastify/cookie'
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { FastifyReply, FastifyRequest } from 'fastify'
import crypto from 'node:crypto'
import { HTTP_CSRF_IGNORED_METHODS } from '../applications/applications.constants'
import { UserModel } from '../applications/users/models/user.model'
import { convertHumanTimeToSeconds } from '../common/functions'
import { currentTimeStamp } from '../common/shared'
import { configuration, serverConfig } from '../configuration/config.environment'
import { CSRF_ERROR, CSRF_KEY, TOKEN_2FA_TYPES, TOKEN_PATHS, TOKEN_TYPES } from './constants/auth'
import { API_OIDC_LOGIN } from './constants/routes'
import { LoginResponseDto, LoginVerify2FaDto } from './dto/login-response.dto'
import { TokenResponseDto } from './dto/token-response.dto'
import { JwtIdentity2FaPayload, JwtIdentityPayload, JwtPayload } from './interfaces/jwt-payload.interface'
import { TOKEN_TYPE } from './interfaces/token.interface'
import { AUTH_PROVIDER } from './providers/auth-providers.constants'
import type { AuthOIDCSettings } from './providers/oidc/auth-oidc.interfaces'

@Injectable()
export class AuthManager {
  private readonly logger = new Logger(AuthManager.name)

  constructor(private readonly jwt: JwtService) {}

  async getTokens(user: UserModel, refresh = false): Promise<TokenResponseDto> {
    const currentTime = currentTimeStamp()
    if (refresh && user.exp < currentTime) {
      this.logger.error(`${this.getTokens.name} - token refresh has incorrect expiration : *${user.login}*`)
      throw new HttpException('Token has expired', HttpStatus.FORBIDDEN)
    }
    const accessExpiration = convertHumanTimeToSeconds(configuration.auth.token.access.expiration)
    const refreshExpiration = refresh ? user.exp - currentTime : convertHumanTimeToSeconds(configuration.auth.token.refresh.expiration)
    return {
      [TOKEN_TYPE.ACCESS]: await this.jwtSign(user, TOKEN_TYPE.ACCESS, accessExpiration),
      [TOKEN_TYPE.REFRESH]: await this.jwtSign(user, TOKEN_TYPE.REFRESH, refreshExpiration),
      [`${TOKEN_TYPE.ACCESS}_expiration`]: accessExpiration + currentTime,
      [`${TOKEN_TYPE.REFRESH}_expiration`]: refreshExpiration + currentTime
    }
  }

  async setCookies(user: UserModel, res: FastifyReply, init2FaVerify: true): Promise<LoginVerify2FaDto>
  async setCookies(user: UserModel, res: FastifyReply, init2FaVerify?: false): Promise<LoginResponseDto>
  async setCookies(user: UserModel, res: FastifyReply, init2FaVerify = false): Promise<LoginResponseDto | LoginVerify2FaDto> {
    // If `verify2Fa` is true, it sets the cookies and response required for valid 2FA authentication.
    const verify2Fa = init2FaVerify && configuration.auth.mfa.totp.enabled && user.twoFaEnabled
    const response = verify2Fa ? new LoginVerify2FaDto(serverConfig) : new LoginResponseDto(user, serverConfig)
    const currentTime = currentTimeStamp()
    const csrfToken: string = crypto.randomUUID()
    const tokenTypes: TOKEN_TYPE[] = verify2Fa ? TOKEN_2FA_TYPES : TOKEN_TYPES
    for (const type of tokenTypes) {
      const isCSRFToken = type === TOKEN_TYPE.CSRF || type === TOKEN_TYPE.CSRF_2FA
      const tokenExpiration = convertHumanTimeToSeconds(configuration.auth.token[type].expiration)
      let cookieValue: string
      if (isCSRFToken) {
        cookieValue = csrfToken
      } else if (verify2Fa) {
        cookieValue = await this.jwtSign2Fa(user, type, tokenExpiration, csrfToken)
      } else {
        cookieValue = await this.jwtSign(user, type, tokenExpiration, csrfToken)
      }
      res.setCookie(configuration.auth.token[type].name, cookieValue, {
        signed: isCSRFToken,
        path: TOKEN_PATHS[type],
        maxAge: tokenExpiration,
        httpOnly: !isCSRFToken
      })
      if (type === TOKEN_TYPE.ACCESS || type === TOKEN_TYPE.REFRESH || type === TOKEN_TYPE.ACCESS_2FA) {
        response.token[`${type}_expiration`] = tokenExpiration + currentTime
      }
    }
    return response
  }

  async refreshCookies(user: UserModel, res: FastifyReply): Promise<TokenResponseDto> {
    const response = {} as TokenResponseDto
    const currentTime = currentTimeStamp()
    let refreshTokenExpiration: number
    // refresh cookie must have the `exp` attribute
    // reuse token expiration to make it final
    if (user.exp && user.exp > currentTime) {
      refreshTokenExpiration = user.exp - currentTime
    } else {
      this.logger.error(`${this.refreshCookies.name} - token ${TOKEN_TYPE.REFRESH} has incorrect expiration : *${user.login}*`)
      throw new HttpException('Token has expired', HttpStatus.FORBIDDEN)
    }
    const csrfToken: string = crypto.randomUUID()
    for (const type of TOKEN_TYPES) {
      const tokenExpiration =
        type === TOKEN_TYPE.ACCESS ? convertHumanTimeToSeconds(configuration.auth.token[TOKEN_TYPE.ACCESS].expiration) : refreshTokenExpiration
      const cookieValue: string = type === TOKEN_TYPE.CSRF ? csrfToken : await this.jwtSign(user, type, tokenExpiration, csrfToken)
      res.setCookie(configuration.auth.token[type].name, cookieValue, {
        signed: type === TOKEN_TYPE.CSRF,
        path: TOKEN_PATHS[type],
        maxAge: tokenExpiration,
        httpOnly: type !== TOKEN_TYPE.CSRF
      })
      if (type === TOKEN_TYPE.ACCESS || type === TOKEN_TYPE.REFRESH) {
        response[`${type}_expiration`] = tokenExpiration + currentTime
      }
    }
    return response
  }

  async clearCookies(res: FastifyReply) {
    for (const [type, path] of Object.entries(TOKEN_PATHS)) {
      res.clearCookie(configuration.auth.token[type].name, { path: path })
    }
  }

  csrfValidation(req: FastifyRequest, jwtPayload: JwtPayload, type: TOKEN_TYPE.ACCESS | TOKEN_TYPE.REFRESH): void {
    // ignore safe methods
    if (HTTP_CSRF_IGNORED_METHODS.has(req.method)) {
      return
    }

    // check csrf only for access and refresh cookies
    if (typeof req.cookies !== 'object' || req.cookies[configuration.auth.token[type].name] === undefined) {
      return
    }

    if (!jwtPayload.csrf) {
      this.logger.warn(`${this.csrfValidation.name} - ${CSRF_ERROR.MISSING_JWT}`)
      throw new HttpException(CSRF_ERROR.MISSING_JWT, HttpStatus.FORBIDDEN)
    }

    if (!req.headers[CSRF_KEY]) {
      this.logger.warn(`${this.csrfValidation.name} - ${CSRF_ERROR.MISSING_HEADERS}`)
      throw new HttpException(CSRF_ERROR.MISSING_HEADERS, HttpStatus.FORBIDDEN)
    }

    const csrfHeader: UnsignResult = unsign(req.headers[CSRF_KEY] as string, configuration.auth.token.csrf.secret)
    if (jwtPayload.csrf !== csrfHeader.value) {
      this.logger.warn(`${this.csrfValidation.name} - ${CSRF_ERROR.MISMATCH}`)
      throw new HttpException(CSRF_ERROR.MISMATCH, HttpStatus.FORBIDDEN)
    }
  }

  authSettings(): AuthOIDCSettings | false {
    if (configuration.auth.provider !== AUTH_PROVIDER.OIDC) {
      return false
    }
    return {
      loginUrl: API_OIDC_LOGIN,
      autoRedirect: configuration.auth.oidc.options.autoRedirect,
      buttonText: configuration.auth.oidc.options.buttonText
    }
  }

  private jwtSign(user: UserModel, type: TOKEN_TYPE, expiration: number, csrfToken?: string): Promise<string> {
    return this.jwt.signAsync(
      {
        identity: {
          id: user.id,
          login: user.login,
          email: user.email,
          fullName: user.fullName,
          language: user.language,
          role: user.role,
          applications: user.applications,
          impersonatedFromId: user.impersonatedFromId || undefined,
          impersonatedClientId: user.impersonatedClientId || undefined,
          clientId: user.clientId || undefined,
          twoFaEnabled: user.twoFaEnabled || undefined
        } satisfies JwtIdentityPayload,
        ...((type === TOKEN_TYPE.ACCESS || type === TOKEN_TYPE.REFRESH) && { csrf: csrfToken })
      },
      {
        secret: configuration.auth.token[type].secret,
        expiresIn: expiration
      }
    )
  }

  private jwtSign2Fa(user: UserModel, type: TOKEN_TYPE, expiration: number, csrfToken: string): Promise<string> {
    // Restrict the temporary token to the minimum required information
    return this.jwt.signAsync(
      {
        identity: {
          id: user.id,
          login: user.login,
          language: user.language,
          role: user.role,
          twoFaEnabled: true
        } satisfies JwtIdentity2FaPayload,
        csrf: csrfToken
      },
      {
        secret: configuration.auth.token[type].secret,
        expiresIn: expiration
      }
    )
  }
}
