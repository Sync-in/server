import { Injectable, UnauthorizedException } from '@nestjs/common'
import { AbstractStrategy, PassportStrategy } from '@nestjs/passport'
import { PinoLogger } from 'nestjs-pino'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { TOKEN_TYPE } from '../../../../authentication/interfaces/token.interface.js'
import { configuration } from '../../../../configuration/config.environment.js'
import { UserModel } from '../../../users/models/user.model.js'
import { COLLABORA_TOKEN_QUERY_PARAM_NAME } from './collabora-online.constants.js'
import type { JwtPayloadCollaboraOnline } from './collabora-online.interface.js'

@Injectable()
export class CollaboraOnlineStrategy extends PassportStrategy(Strategy, 'filesCollaboraOnlineToken') implements AbstractStrategy {
  constructor(private readonly logger: PinoLogger) {
    super({
      jwtFromRequest: ExtractJwt.fromUrlQueryParameter(COLLABORA_TOKEN_QUERY_PARAM_NAME),
      secretOrKey: configuration.auth.token.access.secret,
      ignoreExpiration: false,
      passReqToCallback: false
    })
  }

  validate(jwtPayload: JwtPayloadCollaboraOnline): UserModel {
    if (jwtPayload.tokenType !== TOKEN_TYPE.COLLABORA_ONLINE) {
      throw new UnauthorizedException()
    }
    this.logger.assign({ user: jwtPayload.identity.login })
    return new UserModel(jwtPayload.identity)
  }
}
