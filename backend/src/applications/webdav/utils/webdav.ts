import { FastifyReply } from 'fastify'
import http from 'node:http'
import { currentTimeStamp, encodeUrl, SERVER_NAME } from '../../../common/shared'
import { FileLock } from '../../files/interfaces/file-lock.interface'
import { LOCK_SCOPE, NS_DAV, NS_PREFIX, PROPSTAT, XML_CONTENT_TYPE } from '../constants/webdav'
import { XML_NS, xmlBuild } from './xml'

export const XML_DAV_NS = { [`${XML_NS}:${NS_PREFIX}`]: `${NS_DAV}` }
export const PROPFIND_COLLECTION = { [`${NS_PREFIX}:collection`]: null }
export const PROPFIND_ALL_PROP = {
  [`${NS_PREFIX}:propfind`]: {
    [`${NS_PREFIX}:${PROPSTAT.ALLPROP}`]: null,
    ...XML_DAV_NS
  }
}

export const SUPPORTED_LOCKS = {
  [`${NS_PREFIX}:lockentry`]: [
    {
      [`${NS_PREFIX}:lockscope`]: {
        [`${NS_PREFIX}:exclusive`]: null
      },
      [`${NS_PREFIX}:locktype`]: {
        [`${NS_PREFIX}:write`]: null
      }
    },
    {
      [`${NS_PREFIX}:lockscope`]: {
        [`${NS_PREFIX}:shared`]: null
      },
      [`${NS_PREFIX}:locktype`]: {
        [`${NS_PREFIX}:write`]: null
      }
    }
  ]
}

export function PROP(prop: any, httpVersion: string, httpStatus: number, description?: string) {
  return {
    [`${NS_PREFIX}:prop`]: prop,
    [`${NS_PREFIX}:status`]: `${httpVersion} ${httpStatus} ${http.STATUS_CODES[httpStatus]}`,
    [`${NS_PREFIX}:responsedescription`]: description ? { [`${NS_PREFIX}:error`]: { [`${NS_PREFIX}:${description}`]: null } } : undefined
  }
}

export function PROP_STAT(href: string, props: any) {
  return {
    [`${NS_PREFIX}:href`]: href,
    [`${NS_PREFIX}:propstat`]: props
  }
}

export function MULTI_STATUS(content: any) {
  return {
    [`${NS_PREFIX}:multistatus`]: { [`${NS_PREFIX}:response`]: content, ...XML_DAV_NS }
  }
}

export function LOCK_DISCOVERY(locks: FileLock[]) {
  // only locktype write is currently implemented in RFC
  const activeLocks = []
  for (const lock of locks) {
    activeLocks.push({
      [`${NS_PREFIX}:activelock`]: {
        [`${NS_PREFIX}:locktype`]: { [`${NS_PREFIX}:write`]: null },
        [`${NS_PREFIX}:lockscope`]: { [`${NS_PREFIX}:${lock.options?.lockScope || LOCK_SCOPE.EXCLUSIVE}`]: null },
        [`${NS_PREFIX}:locktoken`]: { [`${NS_PREFIX}:href`]: lock.options?.lockToken || SERVER_NAME },
        [`${NS_PREFIX}:lockroot`]: { [`${NS_PREFIX}:href`]: encodeUrl(lock.options?.lockRoot || lock.dbFilePath) },
        [`${NS_PREFIX}:owner`]: formatLockOwner(lock),
        [`${NS_PREFIX}:timeout`]: `Second-${Math.floor(lock.expiration - currentTimeStamp())}`,
        [`${NS_PREFIX}:depth`]: lock.depth
      }
    })
  }
  return activeLocks
}

export function LOCK_PROP(locks: FileLock[]) {
  return { [`${NS_PREFIX}:prop`]: { [`${NS_PREFIX}:lockdiscovery`]: LOCK_DISCOVERY(locks), ...XML_DAV_NS } }
}

export function DAV_ERROR(error: string, href?: string): string {
  return xmlBuild({
    'ns0:error': { [`ns0:${error}`]: href ? [{ 'ns0:href': encodeUrl(href) }] : '', [`${XML_NS}:ns0`]: `${NS_DAV}` }
  })
}

export function DAV_ERROR_RES(code: number, error: string, res: FastifyReply, href?: string): FastifyReply {
  return res.status(code).type(XML_CONTENT_TYPE).send(DAV_ERROR(error, href))
}

function formatLockOwner(lock: FileLock) {
  const lockInfo = `${lock.options.lockInfo ? `${lock.options.lockInfo}` : ''}${lock.app ? ` ${lock.app}` : ''}`
  return `${lock.owner.fullName} (${lock.owner.email})${lockInfo ? ` - ${lockInfo}` : ''}`
}
