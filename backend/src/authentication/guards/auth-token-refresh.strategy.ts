/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Injectable } from '@nestjs/common'
import { AbstractStrategy, PassportStrategy } from '@nestjs/passport'
import { FastifyRequest } from 'fastify'
import { PinoLogger } from 'nestjs-pino'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { UserModel } from '../../applications/users/models/user.model'
import { configuration } from '../../configuration/config.environment'
import { JwtPayload } from '../interfaces/jwt-payload.interface'
import { TOKEN_TYPE } from '../interfaces/token.interface'
import { AuthManager } from '../services/auth-manager.service'

@Injectable()
export class AuthTokenRefreshStrategy extends PassportStrategy(Strategy, 'tokenRefresh') implements AbstractStrategy {
  private static refreshCookieName: string

  constructor(
    private readonly authManager: AuthManager,
    private readonly logger: PinoLogger
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([AuthTokenRefreshStrategy.extractJWTFromCookie, ExtractJwt.fromAuthHeaderAsBearerToken()]),
      secretOrKey: configuration.auth.token.refresh.secret,
      ignoreExpiration: false,
      passReqToCallback: true
    })
    AuthTokenRefreshStrategy.refreshCookieName = configuration.auth.token.refresh.name
  }

  validate(req: FastifyRequest, jwtPayload: JwtPayload): UserModel {
    this.logger.assign({ user: jwtPayload.identity.login })
    this.authManager.csrfValidation(req, jwtPayload, TOKEN_TYPE.REFRESH)
    // jwt expiration is used later to refresh cookies
    return new UserModel({ ...jwtPayload.identity, exp: jwtPayload.exp })
  }

  private static extractJWTFromCookie(req: FastifyRequest): string | null {
    if (typeof req.cookies === 'object' && req.cookies[AuthTokenRefreshStrategy.refreshCookieName] !== undefined) {
      return req.cookies[AuthTokenRefreshStrategy.refreshCookieName]
    }
    return null
  }
}
