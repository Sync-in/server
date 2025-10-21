/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common'
import { SERVER_NAME } from '../../../common/shared'
import { XML_CONTENT_TYPE } from '../constants/webdav'

@Catch(HttpException)
export class WebDAVExceptionsFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const res = ctx.getResponse()
    const status = exception.getStatus()

    if (status === 401) {
      // req.authInfo from the AuthBasicGuard
      res.header('WWW-Authenticate', `Basic realm="${SERVER_NAME}"`).status(status).send()
    } else {
      let response: any = exception.getResponse()
      if (typeof response === 'object' && response !== null) {
        response = response.message
      }
      res.type(XML_CONTENT_TYPE).status(status).send(response)
    }
  }
}
