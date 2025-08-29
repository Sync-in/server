/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { ExecutionContext, Injectable, Logger } from '@nestjs/common'
import { AuthGuard, IAuthGuard } from '@nestjs/passport'
import { FastifyRequest } from 'fastify'
import { HTTP_METHOD } from '../../applications/applications.constants'
import { WEBDAV_BASE_PATH } from '../../applications/webdav/constants/routes'

@Injectable()
export class AuthBasicGuard extends AuthGuard('basic') implements IAuthGuard {
  private readonly logger = new Logger(AuthBasicGuard.name)

  canActivate(ctx: ExecutionContext) {
    // allow options method on server (webdav)
    const req: FastifyRequest = this.getRequest(ctx)
    if (req.method === HTTP_METHOD.OPTIONS) {
      // only allow options method to skip auth check on the server and webdav paths (including child uris)
      const segments = req.originalUrl.split('/').filter(Boolean)
      if (!segments.length || segments[0] === WEBDAV_BASE_PATH) {
        return true
      }
    }
    return super.canActivate(ctx)
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
