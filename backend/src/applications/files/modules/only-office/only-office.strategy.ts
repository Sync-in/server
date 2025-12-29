/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Injectable } from '@nestjs/common'
import { AbstractStrategy, PassportStrategy } from '@nestjs/passport'
import { PinoLogger } from 'nestjs-pino'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { AuthTokenAccessStrategy } from '../../../../authentication/guards/auth-token-access.strategy'
import { JwtPayload } from '../../../../authentication/interfaces/jwt-payload.interface'
import { configuration } from '../../../../configuration/config.environment'
import { UserModel } from '../../../users/models/user.model'
import { ONLY_OFFICE_TOKEN_QUERY_PARAM_NAME } from './only-office.constants'

@Injectable()
export class OnlyOfficeStrategy extends PassportStrategy(Strategy, 'filesOnlyOfficeToken') implements AbstractStrategy {
  constructor(private readonly logger: PinoLogger) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        AuthTokenAccessStrategy.extractJWTFromCookie,
        ExtractJwt.fromUrlQueryParameter(ONLY_OFFICE_TOKEN_QUERY_PARAM_NAME)
      ]),
      secretOrKey: configuration.auth.token.access.secret,
      ignoreExpiration: false,
      passReqToCallback: false
    })
  }

  validate(jwtPayload: JwtPayload): UserModel {
    this.logger.assign({ user: jwtPayload.identity.login })
    return new UserModel(jwtPayload.identity)
  }
}
