/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */
import { ArgumentsHost, HttpException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { SERVER_NAME } from '../../../app.constants'
import { XML_CONTENT_TYPE } from '../constants/webdav'
import { WebDAVExceptionsFilter } from './webdav.filter'

describe('WebDAVExceptionsFilter', () => {
  let filter: WebDAVExceptionsFilter

  const createMockResponse = () => {
    const res: any = {}
    res.header = jest.fn().mockReturnValue(res)
    res.type = jest.fn().mockReturnValue(res)
    res.status = jest.fn().mockReturnValue(res)
    res.send = jest.fn().mockReturnValue(res)
    return res
  }

  const createMockHost = (res: any): ArgumentsHost =>
    ({
      switchToHttp: () => ({
        getResponse: () => res
      })
      // Other methods not used by the filter
    }) as unknown as ArgumentsHost

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [WebDAVExceptionsFilter]
    }).compile()

    filter = moduleRef.get(WebDAVExceptionsFilter)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should set WWW-Authenticate header and send empty body for 401', () => {
    const res = createMockResponse()
    const host = createMockHost(res)
    const exception = new HttpException('Unauthorized', 401)

    filter.catch(exception, host)

    expect(res.header).toHaveBeenCalledWith('WWW-Authenticate', `Basic realm="${SERVER_NAME}"`)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.type).not.toHaveBeenCalled()
    expect(res.send).toHaveBeenCalled()
    // Ensure no body is sent
    expect(res.send.mock.calls[0][0]).toBeUndefined()
  })

  it('should set XML content type and forward string response for non-401', () => {
    const res = createMockResponse()
    const host = createMockHost(res)
    const exception = new HttpException('Internal error', 500)

    filter.catch(exception, host)

    expect(res.type).toHaveBeenCalledWith(XML_CONTENT_TYPE)
    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.send).toHaveBeenCalledWith('Internal error')
    expect(res.header).not.toHaveBeenCalled()
  })

  it('should extract "message" from object response and send it as XML for non-401', () => {
    const res = createMockResponse()
    const host = createMockHost(res)
    const payload = { message: '<error>Bad Request</error>' }
    const exception = new HttpException(payload, 400)

    filter.catch(exception, host)

    expect(res.type).toHaveBeenCalledWith(XML_CONTENT_TYPE)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.send).toHaveBeenCalledWith(payload.message)
    expect(res.header).not.toHaveBeenCalled()
  })
})
