/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { HTTP_METHOD } from '../../applications.constants'
import { ONLY_OFFICE_CONTEXT } from '../../files/constants/only-office'
import { API_FILES_ONLY_OFFICE_CALLBACK } from '../../files/constants/routes'
import { SYNC_CONTEXT } from '../../sync/decorators/sync-context.decorator'
import { SYNC_PATH_TO_SPACE_SEGMENTS } from '../../sync/utils/routes'
import { WEB_DAV_CONTEXT } from '../../webdav/decorators/webdav-context.decorator'
import { WEBDAV_PATH_TO_SPACE_SEGMENTS } from '../../webdav/utils/routes'
import { SPACE_HTTP_PERMISSION, SPACE_OPERATION } from '../constants/spaces'
import { SKIP_SPACE_GUARD } from '../decorators/space-skip-guard.decorator'
import { SKIP_SPACE_PERMISSIONS_CHECK } from '../decorators/space-skip-permissions.decorator'
import { FastifySpaceRequest } from '../interfaces/space-request.interface'
import { SpaceEnv } from '../models/space-env.model'
import { SpacesManager } from '../services/spaces-manager.service'
import { canAccessToSpaceUrl, haveSpaceEnvPermissions } from '../utils/permissions'
import { PATH_TO_SPACE_SEGMENTS } from '../utils/routes'

@Injectable()
export class SpaceGuard implements CanActivate {
  private readonly logger = new Logger(SpaceGuard.name)

  constructor(
    private readonly reflector: Reflector,
    private readonly spacesManager: SpacesManager
  ) {}

  static checkPermissions(req: FastifySpaceRequest, logger: Logger, onlyOfficeContext = false) {
    let permission: SPACE_OPERATION
    if (onlyOfficeContext && req.method === HTTP_METHOD.POST && req.originalUrl.startsWith(API_FILES_ONLY_OFFICE_CALLBACK)) {
      // special case : onlyoffice callback use post method to update documents
      permission = SPACE_OPERATION.MODIFY
    } else {
      permission = SPACE_HTTP_PERMISSION[req.method]
    }
    if (!haveSpaceEnvPermissions(req.space, permission)) {
      logger.warn(`is not allowed to ${req.method} on this space path : *${req.space.alias}* (${req.space.id}) : ${req.space.url}`)
      throw new HttpException('You are not allowed to do this action', HttpStatus.FORBIDDEN)
    }
    if ([SPACE_OPERATION.ADD, SPACE_OPERATION.MODIFY].indexOf(permission) > -1) {
      if (req.space.quotaIsExceeded) {
        logger.warn(`Storage quota exceeded for *${req.space.alias}* (${req.space.id})`)
        throw new HttpException('Storage quota exceeded', HttpStatus.INSUFFICIENT_STORAGE)
      } else if (req.space.storageQuota) {
        const contentLength = parseInt(req.headers['content-length'] || '0', 10) || 0
        if (req.space.willExceedQuota(contentLength)) {
          throw new HttpException('Storage quota will be exceeded', HttpStatus.INSUFFICIENT_STORAGE)
        }
      }
    }
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const skipSpaceGuard = this.reflector.getAllAndOverride(SKIP_SPACE_GUARD, [ctx.getHandler(), ctx.getClass()])
    if (skipSpaceGuard) {
      return true
    }
    const skipSpacePermissionsCheck = this.reflector.getAllAndOverride(SKIP_SPACE_PERMISSIONS_CHECK, [ctx.getHandler(), ctx.getClass()])
    const req: FastifySpaceRequest = ctx.switchToHttp().getRequest()
    const onlyOfficeContext = this.reflector.getAllAndOverride(ONLY_OFFICE_CONTEXT, [ctx.getHandler(), ctx.getClass()])
    const webDAVContext = this.reflector.getAllAndOverride(WEB_DAV_CONTEXT, [ctx.getHandler(), ctx.getClass()])
    const syncContext = this.reflector.getAllAndOverride(SYNC_CONTEXT, [ctx.getHandler(), ctx.getClass()])
    const urlSegments = this.urlSegmentsFromContext(req, webDAVContext, syncContext)
    this.checkAccessToSpace(req, urlSegments)
    let space: SpaceEnv
    try {
      space = await this.spacesManager.spaceEnv(req.user, urlSegments)
    } catch (e) {
      this.logger.warn(`${this.canActivate.name} - ${e}`)
      throw new HttpException('Space path is not valid', HttpStatus.BAD_REQUEST)
    }
    if (!space) {
      this.logger.warn(`${this.canActivate.name} - space not authorized or not found : ${req.params['*']}`)
      throw new HttpException('Space not found', HttpStatus.NOT_FOUND)
    }
    if (!space.enabled) {
      throw new HttpException('Space is disabled', HttpStatus.FORBIDDEN)
    }
    // assign space to request
    req.space = space
    if (skipSpacePermissionsCheck === undefined) {
      SpaceGuard.checkPermissions(req, this.logger, onlyOfficeContext)
    }
    return true
  }

  private urlSegmentsFromContext(req: FastifySpaceRequest, webDAVContext: boolean, syncContext: boolean): string[] {
    if (webDAVContext || syncContext) {
      try {
        if (webDAVContext) {
          return WEBDAV_PATH_TO_SPACE_SEGMENTS(req.params['*'])
        } else {
          return SYNC_PATH_TO_SPACE_SEGMENTS(req.params['*'])
        }
      } catch (e) {
        this.logger.warn(`${this.canActivate.name} - ${e}`)
        throw new HttpException(e.message, HttpStatus.NOT_FOUND)
      }
    }
    return PATH_TO_SPACE_SEGMENTS(req.params['*'])
  }

  private checkAccessToSpace(req: FastifySpaceRequest, urlSegments: string[]) {
    if (!canAccessToSpaceUrl(req.user, urlSegments)) {
      this.logger.warn(`is not allowed to access to this space repository : ${req.params['*']}`)
      throw new HttpException('You are not allowed to access to this repository', HttpStatus.FORBIDDEN)
    }
  }
}
