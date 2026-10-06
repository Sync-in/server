import { UserModel } from '../../applications/users/models/user.model.js'
import { ServerConfig } from '../../configuration/config.interfaces.js'
import { TokenResponseDto } from './token-response.dto.js'

export class LoginResponseDto {
  server: ServerConfig
  user: UserModel
  token: TokenResponseDto

  constructor(user: UserModel, serverConfig: ServerConfig) {
    this.server = serverConfig
    this.user = user
    this.token = new TokenResponseDto()
  }
}

export class LoginVerify2FaDto {
  server: ServerConfig
  user: { twoFaEnabled: boolean } = { twoFaEnabled: true }
  token: TokenResponseDto

  constructor(serverConfig: ServerConfig) {
    this.server = serverConfig
    this.token = new TokenResponseDto()
  }
}
