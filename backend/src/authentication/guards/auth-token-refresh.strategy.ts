import { Injectable, UnauthorizedException } from '@nestjs/common'
import { AbstractStrategy, PassportStrategy } from '@nestjs/passport'
import { FastifyRequest } from 'fastify'
import { PinoLogger } from 'nestjs-pino'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { USER_ROLE } from '../../applications/users/constants/user.js'
import { UserModel } from '../../applications/users/models/user.model.js'
import { UsersManager } from '../../applications/users/services/users-manager.service.js'
import { configuration } from '../../configuration/config.environment.js'
import { AuthManager } from '../auth.service.js'
import type { JwtPayload } from '../interfaces/jwt-payload.interface.js'
import { TOKEN_TYPE } from '../interfaces/token.interface.js'

@Injectable()
export class AuthTokenRefreshStrategy extends PassportStrategy(Strategy, 'tokenRefresh') implements AbstractStrategy {
  private static refreshCookieName: string

  constructor(
    private readonly authManager: AuthManager,
    private readonly usersManager: UsersManager,
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

  async validate(req: FastifyRequest, jwtPayload: JwtPayload): Promise<UserModel> {
    if (jwtPayload.tokenType !== TOKEN_TYPE.REFRESH) {
      throw new UnauthorizedException()
    }
    this.logger.assign({ user: jwtPayload.identity.login })
    this.authManager.csrfValidation(req, jwtPayload, TOKEN_TYPE.REFRESH)
    const user = await this.usersManager.fromAuthToken(new UserModel({ ...jwtPayload.identity, exp: jwtPayload.exp }))
    if (!user) {
      throw new UnauthorizedException()
    }
    // A link session must stop being refreshed once its link has expired
    if (user.role === USER_ROLE.LINK && (await this.usersManager.isLinkExpired(user.id))) {
      throw new UnauthorizedException()
    }
    return user
  }

  private static extractJWTFromCookie(req: FastifyRequest): string | null {
    if (typeof req.cookies === 'object' && req.cookies[AuthTokenRefreshStrategy.refreshCookieName] !== undefined) {
      return req.cookies[AuthTokenRefreshStrategy.refreshCookieName] as string
    }
    return null
  }
}
