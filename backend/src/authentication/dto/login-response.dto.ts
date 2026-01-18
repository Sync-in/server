/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { UserModel } from '../../applications/users/models/user.model'
import { ServerConfig } from '../../configuration/config.interfaces'
import { TokenResponseDto } from './token-response.dto'

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
