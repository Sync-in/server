/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { FastifyAuthenticatedRequest } from '../../../authentication/interfaces/auth-request.interface'
import { USER_ROLE } from '../constants/user'
import { UserHaveRole } from '../decorators/roles.decorator'

@Injectable()
export class UserRolesGuard implements CanActivate {
  private readonly logger = new Logger(UserRolesGuard.name)

  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const role: USER_ROLE = this.reflector.getAllAndOverride(UserHaveRole, [ctx.getHandler(), ctx.getClass()])
    if (typeof role === 'object') {
      // used to bypass the check, the guard is called without argument, the value is '{}'
      return true
    }
    if (role === undefined || !Number.isFinite(role)) {
      this.logger.warn(`no role defined on : ${ctx.getClass().name}:${ctx.getHandler().name}`)
      return false
    }
    const req: FastifyAuthenticatedRequest = ctx.switchToHttp().getRequest()
    const authorized: boolean = req.user.haveRole(role)
    if (!authorized) {
      this.logger.warn(`does not have role : ${USER_ROLE[role]}`)
    }
    return authorized
  }
}
