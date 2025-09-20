/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { CONNECT_ERROR_CODE } from '../../../app.constants'
import { UserModel } from '../../../applications/users/models/user.model'
import { UsersManager } from '../../../applications/users/services/users-manager.service'
import { AUTH_SCOPE } from '../../constants/scope'
import { AuthMethod } from '../../models/auth-method'

@Injectable()
export class AuthMethodDatabase implements AuthMethod {
  private readonly logger = new Logger(AuthMethodDatabase.name)

  constructor(private readonly usersManager: UsersManager) {}

  async validateUser(loginOrEmail: string, password: string, ip?: string, scope?: AUTH_SCOPE): Promise<UserModel> {
    let user: UserModel
    try {
      user = await this.usersManager.findUser(loginOrEmail, false)
    } catch (e) {
      this.logger.error(`${this.validateUser.name} - ${e}`)
      throw new HttpException(CONNECT_ERROR_CODE.has(e.cause?.code) ? 'Authentication service error' : e.message, HttpStatus.INTERNAL_SERVER_ERROR)
    }
    if (!user) {
      this.logger.warn(`${this.validateUser.name} - login or email not found for *${loginOrEmail}*`)
      return null
    }
    return await this.usersManager.logUser(user, password, ip, scope)
  }
}
