/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { configuration } from '../../configuration/config.environment'
import { TWO_FA_HEADER } from '../constants/auth'
import { FastifyAuthenticatedRequest } from '../interfaces/auth-request.interface'
import { AuthMethod2FA } from '../services/auth-methods/auth-method-two-fa.service'

@Injectable()
export class AuthTwoFaGuard implements CanActivate {
  constructor(private readonly authMethod2FA: AuthMethod2FA) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (!configuration.auth.mfa.totp.enabled) {
      return true
    }
    const req: FastifyAuthenticatedRequest = ctx.switchToHttp().getRequest()
    if (!req.user.twoFaEnabled) {
      return true
    }
    if (!req.headers[TWO_FA_HEADER]) {
      throw new HttpException('Missing TWO-FA in headers', HttpStatus.FORBIDDEN)
    }
    const auth = await this.authMethod2FA.verify({ code: req.headers[TWO_FA_HEADER] as string }, req)
    if (!auth.success) {
      throw new HttpException(auth.message, HttpStatus.FORBIDDEN)
    }
    return auth.success
  }
}
