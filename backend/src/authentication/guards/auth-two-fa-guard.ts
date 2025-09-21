/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, mixin, Type } from '@nestjs/common'
import { configuration } from '../../configuration/config.environment'
import { TWO_FA_HEADER_CODE, TWO_FA_HEADER_PASSWORD } from '../constants/auth'
import { FastifyAuthenticatedRequest } from '../interfaces/auth-request.interface'
import { AuthMethod2FA } from '../services/auth-methods/auth-method-two-fa.service'

export const AuthTwoFaGuard = AuthTwoFaGuardFactory()
export const AuthTwoFaGuardWithoutPassword = AuthTwoFaGuardFactory({ withPassword: false })

interface TwoFaGuardOptions {
  withPassword?: boolean
}

function AuthTwoFaGuardFactory(options: TwoFaGuardOptions = { withPassword: true }): Type<CanActivate> {
  @Injectable()
  class MixinAuthTwoFaGuard implements CanActivate {
    constructor(private readonly authMethod2FA: AuthMethod2FA) {}

    async canActivate(ctx: ExecutionContext): Promise<boolean> {
      const req: FastifyAuthenticatedRequest = ctx.switchToHttp().getRequest()
      const user = await this.authMethod2FA.loadUser(req.user.id, req.ip)

      if (options.withPassword) {
        if (!req.headers[TWO_FA_HEADER_PASSWORD]) {
          throw new HttpException('Missing TWO-FA password', HttpStatus.FORBIDDEN)
        }

        await this.authMethod2FA.verifyUserPassword(user, req.headers[TWO_FA_HEADER_PASSWORD] as string, req.ip)
      }

      if (!configuration.auth.mfa.totp.enabled || !user.twoFaEnabled) {
        return true
      }

      if (!req.headers[TWO_FA_HEADER_CODE]) {
        throw new HttpException('Missing TWO-FA code', HttpStatus.FORBIDDEN)
      }

      const auth = await this.authMethod2FA.verify({ code: req.headers[TWO_FA_HEADER_CODE] as string }, req)

      if (!auth.success) {
        throw new HttpException(auth.message, HttpStatus.FORBIDDEN)
      }

      return true
    }
  }

  return mixin(MixinAuthTwoFaGuard)
}
