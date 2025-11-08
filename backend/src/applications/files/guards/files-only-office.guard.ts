/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { ExecutionContext, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { AuthGuard, IAuthGuard } from '@nestjs/passport'
import { FastifyRequest } from 'fastify'
import { Observable } from 'rxjs'
import { configuration } from '../../../configuration/config.environment'
import { API_FILES_ONLY_OFFICE_STATUS } from '../constants/routes'

@Injectable()
export class FilesOnlyOfficeGuard extends AuthGuard('filesOnlyOfficeToken') implements IAuthGuard {
  private readonly logger = new Logger(FilesOnlyOfficeGuard.name)

  canActivate(ctx: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const req: FastifyRequest = ctx.switchToHttp().getRequest()
    if (req.originalUrl === API_FILES_ONLY_OFFICE_STATUS) {
      // Skip token validation for the status endpoint
      return true
    }
    if (!configuration.applications.files.onlyoffice.enabled) {
      this.logger.warn(`${this.canActivate.name} - feature not enabled`)
      throw new HttpException('Feature not enabled', HttpStatus.BAD_REQUEST)
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
