import { Injectable } from '@nestjs/common'
import { AbstractStrategy, PassportStrategy } from '@nestjs/passport'
import { PinoLogger } from 'nestjs-pino'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { AuthTokenAccessStrategy } from '../../../../authentication/guards/auth-token-access.strategy'
import { JwtPayload } from '../../../../authentication/interfaces/jwt-payload.interface'
import { configuration } from '../../../../configuration/config.environment'
import { UserModel } from '../../../users/models/user.model'
import { COLLABORA_TOKEN_QUERY_PARAM_NAME } from './collabora-online.constants'

@Injectable()
export class CollaboraOnlineStrategy extends PassportStrategy(Strategy, 'filesCollaboraOnlineToken') implements AbstractStrategy {
  constructor(private readonly logger: PinoLogger) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        AuthTokenAccessStrategy.extractJWTFromCookie,
        ExtractJwt.fromUrlQueryParameter(COLLABORA_TOKEN_QUERY_PARAM_NAME)
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
