/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { ValidationError } from 'fast-xml-parser'
import { FastifyReply } from 'fastify'
import { urlToPath } from '../../../common/functions'
import { decodeUrl } from '../../../common/shared'
import { HTTP_METHOD } from '../../applications.constants'
import { FilesLockManager } from '../../files/services/files-lock-manager.service'
import { USER_PERMISSION } from '../../users/constants/user'
import {
  ALLOW_EMPTY_BODY_METHODS,
  DEPTH,
  HEADER,
  LOCK_SCOPE,
  OPTIONS_HEADERS,
  PROPPATCH_PROP_UPDATE,
  PROPSTAT,
  REGEX_BASE_PATH
} from '../constants/webdav'
import { IfHeader } from '../interfaces/if-header.interface'
import { FastifyDAVRequest, WebDAVContext } from '../interfaces/webdav.interface'
import { parseIfHeader } from '../utils/if-header'
import { PROPFIND_ALL_PROP } from '../utils/webdav'
import { xmlIsValid, xmlParse } from '../utils/xml'

@Injectable()
export class WebDAVProtocolGuard implements CanActivate {
  private readonly logger = new Logger(WebDAVProtocolGuard.name)

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req: FastifyDAVRequest = ctx.switchToHttp().getRequest()
    const res: FastifyReply = ctx.switchToHttp().getResponse()
    this.checkUserPermission(req)
    this.setDAVContext(req)
    switch (req.method) {
      case HTTP_METHOD.OPTIONS:
        // hook to stop propagation and return headers on all webdav routes
        res.headers(OPTIONS_HEADERS)
        throw new HttpException(null, HttpStatus.OK)
      case HTTP_METHOD.PROPFIND:
        return this.propfindMethod(req)
      case HTTP_METHOD.LOCK:
        return this.lockMethod(req)
      case HTTP_METHOD.UNLOCK:
        return this.unlockMethod(req)
      case HTTP_METHOD.PUT:
        return this.putMethod(req)
      case HTTP_METHOD.DELETE:
        return this.deleteMethod(req)
      case HTTP_METHOD.PROPPATCH:
        return this.proppatchMethod(req)
      case HTTP_METHOD.MKCOL:
        return this.mkcolMethod(req)
      case HTTP_METHOD.COPY:
        return this.copyMoveMethod(req)
      case HTTP_METHOD.MOVE:
        return this.copyMoveMethod(req, true)
      default:
        return true
    }
  }

  private checkUserPermission(req: FastifyDAVRequest) {
    if (req.method !== HTTP_METHOD.OPTIONS && !req.user.havePermission(USER_PERMISSION.WEBDAV)) {
      this.logger.warn(`does not have permission : ${USER_PERMISSION.WEBDAV}`)
      throw new HttpException('Missing permission', HttpStatus.FORBIDDEN)
    }
  }

  private setDAVContext(req: FastifyDAVRequest) {
    req.dav = {
      url: decodeUrl(req.originalUrl),
      depth: DEPTH.RESOURCE
    } as WebDAVContext
  }

  private parseBody(req: FastifyDAVRequest) {
    let body = null
    let valid: true | ValidationError
    try {
      valid = xmlIsValid(req.body.toString())
    } catch (e) {
      valid = { err: { code: e.code, msg: `Invalid body content: ${e.message}`, line: 0, col: 0 } }
    }
    if (valid === true) {
      body = xmlParse(req.body)
    } else if (valid.err.code === undefined && ALLOW_EMPTY_BODY_METHODS.indexOf(req.method) > -1) {
      body = null
    } else {
      throw new HttpException(`${valid.err.code} : ${valid.err.msg}`, HttpStatus.BAD_REQUEST)
    }
    req.dav.httpVersion = `${req.protocol.toUpperCase()}/${req.raw['httpVersion']}`
    req.dav.body = body
    return true
  }

  private parseIfHeader(req: FastifyDAVRequest) {
    // stores if headers, examine it later
    if (req.headers[HEADER.IF]) {
      this.logger.verbose(`If header before : ${JSON.stringify(req.headers[HEADER.IF])}`)
      const ifHeaders: IfHeader[] = parseIfHeader(req.headers[HEADER.IF] as string)
      this.logger.verbose(`If header after : ${JSON.stringify(ifHeaders)}`)
      if (ifHeaders.length) req.dav.ifHeaders = ifHeaders
    }
  }

  private propfindMethod(req: FastifyDAVRequest) {
    req.dav.depth = (req.headers[HEADER.DEPTH] as string | undefined)?.toLowerCase()
    if (!req.dav.depth || (req.dav.depth !== DEPTH.MEMBERS && req.dav.depth !== DEPTH.RESOURCE)) {
      if (!req.dav.depth) {
        this.logger.warn('Missing propfind depth, default value 1 was set')
      } else if (req.dav.depth === DEPTH.INFINITY) {
        this.logger.warn('Infinite depth is disabled for security reasons, default value 1 was set')
      } else {
        this.logger.warn(`Invalid propfind depth header : ${req.dav.depth}, default value 1 was set`)
      }
      req.dav.depth = DEPTH.MEMBERS
    }
    if (this.parseBody(req)) {
      if (req.dav.body) {
        for (const propType in req.dav.body.propfind) {
          if (Object.values(PROPSTAT).indexOf(propType as PROPSTAT) > -1) {
            req.dav.propfindMode = propType as PROPSTAT
            break
          }
        }
        if (!req.dav.propfindMode) {
          this.logger.warn(`Invalid propfind mode : ${JSON.stringify(Object.keys(req.dav.body.propfind))}`)
          throw new HttpException('Invalid propfind mode', HttpStatus.BAD_REQUEST)
        }
      } else {
        // propfind request allow empty body
        req.dav.body = PROPFIND_ALL_PROP
        req.dav.propfindMode = PROPSTAT.ALLPROP
      }
    }
    this.parseIfHeader(req)
    return true
  }

  private proppatchMethod(req: FastifyDAVRequest) {
    req.dav.depth = ((req.headers[HEADER.DEPTH] as any) || DEPTH.RESOURCE).toLowerCase()
    this.parseBody(req)
    if (!req.dav.body || Object.keys(req.dav.body).indexOf(PROPPATCH_PROP_UPDATE) === -1) {
      this.logger.debug(`'${PROPPATCH_PROP_UPDATE}' is missing : ${JSON.stringify(req.dav.body)}`)
      throw new HttpException(`'${PROPPATCH_PROP_UPDATE}' is missing`, HttpStatus.BAD_REQUEST)
    }
    this.parseIfHeader(req)
    return true
  }

  private lockMethod(req: FastifyDAVRequest) {
    req.dav.lock = {}
    if (req.headers[HEADER.TIMEOUT]) {
      // timeout: 'Infinite, Second-4100000000' | 'Second-4100000000' | 'Infinite'
      const timeout = req.headers[HEADER.TIMEOUT] as string
      if (timeout.toLowerCase() === 'infinite') {
        req.dav.lock.timeout = FilesLockManager.defaultLockTimeoutSeconds
      } else {
        try {
          const timeoutSplit = timeout.split('-')
          const seconds = parseInt(timeoutSplit[timeoutSplit.length - 1], 10)
          req.dav.lock.timeout = seconds > FilesLockManager.defaultLockTimeoutSeconds ? FilesLockManager.defaultLockTimeoutSeconds : seconds
        } catch (e) {
          this.logger.warn(`${this.lockMethod.name} - unable to set timeout, use the default value : ${e}`)
          req.dav.lock.timeout = FilesLockManager.defaultLockTimeoutSeconds
        }
      }
    }
    this.parseBody(req)
    if (req.dav.body) {
      if (!req.dav.body['lockinfo']) {
        this.logger.warn(`Missing lockinfo : ${JSON.stringify(req.dav.body)}`)
        throw new HttpException('Missing lockinfo', HttpStatus.BAD_REQUEST)
      }
      try {
        req.dav.lock.lockscope = Object.keys(req.dav.body['lockinfo']['lockscope'])[0] as LOCK_SCOPE
      } catch (e) {
        this.logger.warn(`${this.parseBody.name} - invalid or undefined lockscope : ${JSON.stringify(req.dav.body['lockinfo'])} : ${e}`)
        throw new HttpException('Invalid or undefined lockscope', HttpStatus.BAD_REQUEST)
      }
      if (Object.values(LOCK_SCOPE).indexOf(req.dav.lock.lockscope) === -1) {
        this.logger.warn(`${this.parseBody.name} - invalid or undefined lockscope : ${JSON.stringify(req.dav.body['lockinfo'])}`)
        throw new HttpException('Invalid or undefined lockscope', HttpStatus.BAD_REQUEST)
      }
      if (req.dav.body['lockinfo']['owner'] && typeof req.dav.body['lockinfo']['owner'] === 'string') {
        req.dav.lock.owner = `${req.dav.body['lockinfo']['owner']} ${req.user.fullName} (${req.user.email})`
      } else {
        req.dav.lock.owner = `WebDAV - ${req.user.fullName} (${req.user.email})`
      }
      const depth: DEPTH = ((req.headers[HEADER.DEPTH] as any) || '').toLowerCase()
      req.dav.depth = [DEPTH.INFINITY, DEPTH.RESOURCE].indexOf(depth) === -1 ? DEPTH.INFINITY : depth
    } else {
      // must ignore depth header on lock refresh request
      req.dav.depth = null
    }
    this.parseIfHeader(req)
    return true
  }

  private unlockMethod(req: FastifyDAVRequest) {
    if (!req.headers[HEADER.LOCK_TOKEN]) {
      throw new HttpException('Missing lock token', HttpStatus.BAD_REQUEST)
    }
    req.dav.lock = { token: (req.headers[HEADER.LOCK_TOKEN] as string).replace('<', '').replace('>', '').trim() }
    this.parseIfHeader(req)
    return true
  }

  private putMethod(req: FastifyDAVRequest) {
    req.dav.depth = DEPTH.RESOURCE
    this.parseIfHeader(req)
    return true
  }

  private deleteMethod(req: FastifyDAVRequest) {
    this.parseIfHeader(req)
    return true
  }

  private mkcolMethod(req: FastifyDAVRequest) {
    if (req.headers['content-length'] && req.headers['content-length'] !== '0') {
      throw new HttpException('no body content required', HttpStatus.UNSUPPORTED_MEDIA_TYPE)
    }
    req.dav.depth = DEPTH.RESOURCE
    this.parseIfHeader(req)
    return true
  }

  private copyMoveMethod(req: FastifyDAVRequest, isMove = false) {
    if (!req.headers[HEADER.DESTINATION]) {
      throw new HttpException(`Missing ${HEADER.DESTINATION} header`, HttpStatus.BAD_REQUEST)
    }
    const destination = decodeUrl(urlToPath(req.headers[HEADER.DESTINATION] as string))
    if (!REGEX_BASE_PATH.test(destination)) {
      this.logger.warn(`The destination does not match the webdav base path : ${destination}`)
      throw new HttpException('The destination does not match', HttpStatus.BAD_REQUEST)
    }
    req.dav.depth = ((req.headers[HEADER.DEPTH] as any) || DEPTH.INFINITY).toLowerCase()
    req.dav.copyMove = {
      overwrite: ((req.headers[HEADER.OVERWRITE] as any) || 't').toLowerCase() === 't',
      destination: destination,
      isMove: isMove
    }
    this.parseIfHeader(req)
    return true
  }
}
