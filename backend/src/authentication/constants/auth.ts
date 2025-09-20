/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { TOKEN_TYPE } from '../interfaces/token.interface'
import { API_AUTH_REFRESH, API_AUTH_WS, API_TWO_FA_LOGIN_VERIFY } from './routes'

export const ACCESS_KEY = 'sync-in-access'
export const REFRESH_KEY = 'sync-in-refresh'
export const CSRF_KEY = 'sync-in-csrf'
export const WS_KEY = 'sync-in-ws'

export const TWO_FA_CODE_LENGTH = 6
export const TWO_FA_VERIFY_EXPIRATION = '5m'
export const TWO_FA_HEADER = 'sync-in-two-fa-code'

export const TOKEN_PATHS = {
  [TOKEN_TYPE.ACCESS]: '/',
  [TOKEN_TYPE.REFRESH]: API_AUTH_REFRESH,
  [TOKEN_TYPE.WS]: API_AUTH_WS,
  [TOKEN_TYPE.CSRF]: '/',
  [TOKEN_TYPE.ACCESS_2FA]: API_TWO_FA_LOGIN_VERIFY,
  [TOKEN_TYPE.CSRF_2FA]: '/'
} as const

export const TOKEN_TYPES: TOKEN_TYPE[] = [TOKEN_TYPE.REFRESH, TOKEN_TYPE.ACCESS, TOKEN_TYPE.WS, TOKEN_TYPE.CSRF] as const
export const TOKEN_2FA_TYPES: TOKEN_TYPE[] = [TOKEN_TYPE.ACCESS_2FA, TOKEN_TYPE.CSRF_2FA] as const

export const CSRF_ERROR = {
  MISSING_JWT: 'Missing CSRF in JWT',
  MISSING_HEADERS: 'Missing CSRF in headers',
  MISMATCH: 'CSRF mismatch'
} as const
