import { FastifyAuthenticatedRequest } from '../../../authentication/interfaces/auth-request.interface.js'
import { SpaceEnv } from '../../spaces/models/space-env.model.js'
import { DEPTH, LOCK_SCOPE, PROPSTAT } from '../constants/webdav.js'
import { IfHeader } from './if-header.interface.js'

export interface WebDAVContext {
  url: string
  body?: any // xml content
  ifHeaders?: IfHeader[]
  depth: DEPTH | null
  propfindMode?: PROPSTAT
  lock?: { timeout?: number; lockscope?: LOCK_SCOPE; owner?: string; token?: string }
  proppatch?: { props: Record<string, string | null>; errors: any[] }
  copyMove?: { overwrite: boolean; destination: string; isMove: boolean }
}

export interface FastifyDAVPendingRequest extends FastifyAuthenticatedRequest {
  body: any
  dav?: WebDAVContext
  space?: SpaceEnv
}

export interface FastifyDAVRequest extends FastifyDAVPendingRequest {
  dav: WebDAVContext
}

export interface FastifyDAVSpaceRequest extends FastifyDAVRequest {
  space: SpaceEnv
}
