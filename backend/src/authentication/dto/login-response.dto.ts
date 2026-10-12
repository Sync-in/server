import { UserModel } from '../../applications/users/models/user.model.js'
import { ServerConfig } from '../../configuration/config.interfaces.js'
import type { TokenExpirationResponseDto } from './token-response.dto.js'

export class LoginResponseDto {
  server: ServerConfig
  user: UserModel
  token: TokenExpirationResponseDto = {}

  constructor(user: UserModel, serverConfig: ServerConfig) {
    this.server = serverConfig
    this.user = user
  }
}

export class LoginVerify2FaDto {
  server: ServerConfig
  user: { twoFaEnabled: boolean } = { twoFaEnabled: true }
  token: TokenExpirationResponseDto = {}

  constructor(serverConfig: ServerConfig) {
    this.server = serverConfig
  }
}
