/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { ExecutionContext, Injectable, Logger } from '@nestjs/common'
import { AuthGuard, IAuthGuard } from '@nestjs/passport'

@Injectable()
export class CollaboraOnlineGuard extends AuthGuard('filesCollaboraOnlineToken') implements IAuthGuard {
  private readonly logger = new Logger(CollaboraOnlineGuard.name)

  handleRequest<TUser = any>(err: any, user: any, info: Error, ctx: ExecutionContext, status?: any): TUser {
    const req = this.getRequest(ctx)
    req.raw.user = user?.login || 'unauthorized'
    if (info) {
      this.logger.warn(`<${req.raw.user}> <${req.ip}> ${info}`)
    }
    return super.handleRequest(err, user, info, ctx, status)
  }
}
