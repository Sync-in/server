import { FastifyAuthenticatedRequest } from '../../../authentication/interfaces/auth-request.interface'
import { SpaceEnv } from '../../spaces/models/space-env.model'
import { DEPTH, LOCK_SCOPE, PROPSTAT } from '../constants/webdav'
import { IfHeader } from './if-header.interface'

export interface WebDAVContext {
  url: string
  body?: any // xml content
  ifHeaders?: IfHeader[]
  depth?: DEPTH | string
  propfindMode?: PROPSTAT
  lock?: { timeout?: number; lockscope?: LOCK_SCOPE; owner?: any; token?: string }
  proppatch?: { props: Record<string, string>; errors: any[] }
  copyMove?: { overwrite: boolean; destination: string; isMove: boolean }
}

export interface FastifyDAVRequest extends FastifyAuthenticatedRequest {
  body: any
  dav?: WebDAVContext
  space?: SpaceEnv
}
