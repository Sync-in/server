import { Injectable, UnauthorizedException } from '@nestjs/common'
import { AbstractStrategy, PassportStrategy } from '@nestjs/passport'
import { FastifyRequest } from 'fastify'
import { PinoLogger } from 'nestjs-pino'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { UserModel } from '../../../../applications/users/models/user.model'
import { configuration } from '../../../../configuration/config.environment'
import { AuthManager } from '../../../auth.service'
import { JwtPayload } from '../../../interfaces/jwt-payload.interface'
import { TOKEN_TYPE } from '../../../interfaces/token.interface'

@Injectable()
export class AuthTokenTwoFaStrategy extends PassportStrategy(Strategy, 'tokenTwoFa') implements AbstractStrategy {
  private static accessCookieName: string

  constructor(
    private readonly authManager: AuthManager,
    private readonly logger: PinoLogger
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([AuthTokenTwoFaStrategy.extractJWTFromCookie]),
      secretOrKey: configuration.auth.token[TOKEN_TYPE.ACCESS_2FA].secret,
      ignoreExpiration: false,
      passReqToCallback: true
    })
    AuthTokenTwoFaStrategy.accessCookieName = configuration.auth.token[TOKEN_TYPE.ACCESS_2FA].name
  }

  validate(req: FastifyRequest, jwtPayload: JwtPayload): UserModel {
    if (jwtPayload.tokenType !== TOKEN_TYPE.ACCESS_2FA) {
      throw new UnauthorizedException()
    }
    this.logger.assign({ user: jwtPayload.identity.login })
    this.authManager.csrfValidation(req, jwtPayload, TOKEN_TYPE.ACCESS_2FA)
    return new UserModel(jwtPayload.identity)
  }

  private static extractJWTFromCookie(req: FastifyRequest): string | null {
    if (typeof req.cookies === 'object' && req.cookies[AuthTokenTwoFaStrategy.accessCookieName] !== undefined) {
      return req.cookies[AuthTokenTwoFaStrategy.accessCookieName]
    }
    return null
  }
}
