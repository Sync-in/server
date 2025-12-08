/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { ExecutionContext, Injectable, Logger } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthGuard, IAuthGuard } from '@nestjs/passport'
import { COLLABORA_CONTEXT } from '../../applications/files/modules/collabora-online/collabora-online.constants'
import { ONLY_OFFICE_CONTEXT } from '../../applications/files/modules/only-office/only-office.constants'
import { WEB_DAV_CONTEXT } from '../../applications/webdav/decorators/webdav-context.decorator'
import { AUTH_TOKEN_SKIP } from '../decorators/auth-token-skip.decorator'

@Injectable()
export class AuthTokenAccessGuard extends AuthGuard('tokenAccess') implements IAuthGuard {
  private readonly logger = new Logger(AuthTokenAccessGuard.name)

  constructor(private readonly reflector: Reflector) {
    super()
  }

  canActivate(ctx: ExecutionContext) {
    const authTokenSkip: boolean = this.reflector.getAllAndOverride<boolean>(AUTH_TOKEN_SKIP, [ctx.getHandler(), ctx.getClass()])
    const webDAVContext: boolean = this.reflector.getAllAndOverride<boolean>(WEB_DAV_CONTEXT, [ctx.getHandler(), ctx.getClass()])
    const onlyOfficeContext: boolean = this.reflector.getAllAndOverride<boolean>(ONLY_OFFICE_CONTEXT, [ctx.getHandler(), ctx.getClass()])
    const collaboraOnlineContext: boolean = this.reflector.getAllAndOverride<boolean>(COLLABORA_CONTEXT, [ctx.getHandler(), ctx.getClass()])
    return authTokenSkip || webDAVContext || onlyOfficeContext || collaboraOnlineContext || super.canActivate(ctx)
  }

  handleRequest<TUser = any>(err: any, user: any, info: Error, ctx: ExecutionContext, status?: any): TUser {
    const req = this.getRequest(ctx)
    req.raw.user = user?.login || 'unauthorized'
    if (info) {
      this.logger.warn(`<${req.raw.user}> <${req.ip}> ${info}`)
    }
    return super.handleRequest(err, user, info, ctx, status)
  }
}
