import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from 'node:http'

export interface FastifyLoggerRequest extends IncomingMessage {
  readonly ip: string
  readonly protocol: 'http' | 'https'
  user?: string
}

export interface LoggerSerializedResponse {
  headers: OutgoingHttpHeaders
}

export interface LoggerErrorObject {
  err: Error
  res: ServerResponse
  responseTime: number
}
