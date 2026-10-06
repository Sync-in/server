import { Injectable, UnauthorizedException } from '@nestjs/common'
import { AbstractStrategy, PassportStrategy } from '@nestjs/passport'
import { PinoLogger } from 'nestjs-pino'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { JwtPayload } from '../../../../authentication/interfaces/jwt-payload.interface.js'
import { TOKEN_TYPE } from '../../../../authentication/interfaces/token.interface.js'
import { configuration } from '../../../../configuration/config.environment.js'
import { UserModel } from '../../../users/models/user.model.js'
import { ONLY_OFFICE_TOKEN_QUERY_PARAM_NAME } from './only-office.constants.js'

@Injectable()
export class OnlyOfficeStrategy extends PassportStrategy(Strategy, 'filesOnlyOfficeToken') implements AbstractStrategy {
  constructor(private readonly logger: PinoLogger) {
    super({
      jwtFromRequest: ExtractJwt.fromUrlQueryParameter(ONLY_OFFICE_TOKEN_QUERY_PARAM_NAME),
      secretOrKey: configuration.auth.token.access.secret,
      ignoreExpiration: false,
      passReqToCallback: false
    })
  }

  validate(jwtPayload: JwtPayload): UserModel {
    if (jwtPayload.tokenType !== TOKEN_TYPE.ONLY_OFFICE) {
      throw new UnauthorizedException()
    }
    this.logger.assign({ user: jwtPayload.identity.login })
    return new UserModel(jwtPayload.identity)
  }
}
