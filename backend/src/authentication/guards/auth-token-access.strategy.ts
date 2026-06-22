import { Injectable, UnauthorizedException } from '@nestjs/common'
import { AbstractStrategy, PassportStrategy } from '@nestjs/passport'
import { FastifyRequest } from 'fastify'
import { PinoLogger } from 'nestjs-pino'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { UserModel } from '../../applications/users/models/user.model'
import { UsersManager } from '../../applications/users/services/users-manager.service'
import { configuration } from '../../configuration/config.environment'
import { AuthManager } from '../auth.service'
import { JwtPayload } from '../interfaces/jwt-payload.interface'
import { TOKEN_TYPE } from '../interfaces/token.interface'

@Injectable()
export class AuthTokenAccessStrategy extends PassportStrategy(Strategy, 'tokenAccess') implements AbstractStrategy {
  private static accessCookieName: string

  constructor(
    private readonly authManager: AuthManager,
    private readonly usersManager: UsersManager,
    private readonly logger: PinoLogger
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([AuthTokenAccessStrategy.extractJWTFromCookie, ExtractJwt.fromAuthHeaderAsBearerToken()]),
      secretOrKey: configuration.auth.token.access.secret,
      ignoreExpiration: false,
      passReqToCallback: true
    })
    AuthTokenAccessStrategy.accessCookieName = configuration.auth.token.access.name
  }

  async validate(req: FastifyRequest, jwtPayload: JwtPayload): Promise<UserModel> {
    if (jwtPayload.tokenType !== TOKEN_TYPE.ACCESS) {
      throw new UnauthorizedException()
    }
    this.logger.assign({ user: jwtPayload.identity.login })
    this.authManager.csrfValidation(req, jwtPayload, TOKEN_TYPE.ACCESS)
    const user = await this.usersManager.fromAuthToken(new UserModel(jwtPayload.identity))
    if (!user) {
      throw new UnauthorizedException()
    }
    return user
  }

  static extractJWTFromCookie(req: FastifyRequest): string | null {
    if (typeof req.cookies === 'object' && req.cookies[AuthTokenAccessStrategy.accessCookieName] !== undefined) {
      return req.cookies[AuthTokenAccessStrategy.accessCookieName]
    }
    return null
  }
}
