import { SERVER_NAME } from '../../../common/shared'
import { HTTP_STANDARD_METHOD, HTTP_WEBDAV_METHOD } from '../../applications.constants'
import { WEBDAV_BASE_PATH } from './routes'

export const REGEX_BASE_PATH = new RegExp(`^/?${WEBDAV_BASE_PATH}/`)
export const NS_DAV = 'DAV:'
export const NS_PREFIX = 'D'
export const LOCK_PREFIX = 'urn:uuid:'
export const XML_CONTENT_TYPE = 'application/xml; charset=utf-8'
export const HTML_CONTENT_TYPE = 'text/html; charset=utf-8'
export const WEBDAV_CONTENT_TYPES = ['application/xml', 'text/xml']
export const WEBDAV_APP_LOCK = 'WebDAV' as const

export const ALLOWED_WEBDAV_METHODS: string = [
  HTTP_STANDARD_METHOD.OPTIONS,
  HTTP_STANDARD_METHOD.HEAD,
  HTTP_STANDARD_METHOD.GET,
  HTTP_STANDARD_METHOD.PUT,
  HTTP_STANDARD_METHOD.DELETE,
  ...Object.values(HTTP_WEBDAV_METHOD)
].join(', ')

export const ALLOW_EMPTY_BODY_METHODS: string[] = [HTTP_WEBDAV_METHOD.PROPFIND, HTTP_WEBDAV_METHOD.LOCK]

export const OPTIONS_HEADERS = {
  Server: SERVER_NAME,
  'MS-Author-Via': 'DAV',
  DAV: '1,2',
  Allow: ALLOWED_WEBDAV_METHODS,
  'Content-Type': HTML_CONTENT_TYPE,
  'Content-Length': '0',
  'Accept-Ranges': 'bytes'
} as const

export const HEADER = {
  DEPTH: 'depth',
  IF: 'if',
  LOCK_TOKEN: 'lock-token',
  DESTINATION: 'destination',
  OVERWRITE: 'overwrite',
  TIMEOUT: 'timeout'
} as const

export const LOCK_DISCOVERY_PROP = 'lockdiscovery'
export const STANDARD_PROPS = [
  'creationdate',
  'getcontenttype',
  'resourcetype',
  'getlastmodified',
  'getcontentlength',
  'displayname',
  'getetag',
  'supportedlock',
  LOCK_DISCOVERY_PROP
]

export enum LOCK_SCOPE {
  EXCLUSIVE = 'exclusive',
  SHARED = 'shared'
}

export enum DEPTH {
  INFINITY = 'infinity',
  RESOURCE = '0',
  MEMBERS = '1'
}

export type LOCK_DEPTH = Omit<DEPTH, DEPTH.MEMBERS>

export enum PROPSTAT {
  ALLPROP = 'allprop',
  PROP = 'prop',
  PROPNAME = 'propname'
}

export const PROPPATCH_PROP_UPDATE = 'propertyupdate'
export const PROPPATCH_METHOD = { SET: 'set', REMOVE: 'remove' }
export const PROPPATCH_MODIFIED_PROPS = ['getlastmodified', 'lastmodified', 'Win32LastModifiedTime']
export const PROPPATCH_SUPPORTED_PROPS = [...PROPPATCH_MODIFIED_PROPS, 'Win32CreationTime', 'Win32LastAccessTime', 'Win32FileAttributes']

export const PRECONDITION = {
  PROTECTED_PROPERTY: 'cannot-modify-protected-property',
  MISSING_LOCK_TOKEN: 'lock-token-submitted',
  LOCK_TOKEN_MISMATCH: 'lock-token-matches-request-uri',
  LOCK_CONFLICT: 'no-conflicting-lock',
  PROPFIND_FINITE_DEPTH: 'propfind-finite-depth'
} as const
