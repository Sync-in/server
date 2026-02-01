/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

export const APP_BASE_ROUTE = '/api/app'

export const HTTP_WEBDAV_METHOD = {
  PROPFIND: 'PROPFIND',
  PROPPATCH: 'PROPPATCH',
  MKCOL: 'MKCOL',
  COPY: 'COPY',
  MOVE: 'MOVE',
  LOCK: 'LOCK',
  UNLOCK: 'UNLOCK'
} as const

export const HTTP_EXTRA_METHODS = {
  SEARCH: 'SEARCH'
}

export const HTTP_STANDARD_METHOD = {
  HEAD: 'HEAD',
  OPTIONS: 'OPTIONS',
  GET: 'GET',
  POST: 'POST',
  PATCH: 'PATCH',
  PUT: 'PUT',
  DELETE: 'DELETE'
} as const

export const HTTP_METHOD = {
  ...HTTP_STANDARD_METHOD,
  ...HTTP_WEBDAV_METHOD,
  ...HTTP_EXTRA_METHODS
} as const

export const HTTP_CSRF_IGNORED_METHODS = new Set<string>([HTTP_METHOD.GET, HTTP_METHOD.HEAD, HTTP_METHOD.OPTIONS, HTTP_METHOD.SEARCH])

export const HTTP_VERSION = 'HTTP/1.1'
