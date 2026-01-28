/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { APP_BASE_ROUTE } from '../../applications.constants'

export const SYNC_BASE_ROUTE = 'sync'
export const SYNC_ROUTE = {
  BASE: `${APP_BASE_ROUTE}/${SYNC_BASE_ROUTE}`,
  HANDSHAKE: 'handshake',
  REGISTER: 'register',
  UNREGISTER: 'unregister',
  REGISTER_AUTH: 'register/auth',
  APP_STORE: 'app-store',
  AUTH: 'auth',
  CLIENTS: 'clients',
  PATHS: 'paths',
  OPERATION: 'operation',
  DIFF: 'diff',
  MAKE: 'make'
}

export const API_SYNC_AUTH_COOKIE = `${SYNC_ROUTE.BASE}/${SYNC_ROUTE.AUTH}/cookie`
export const API_SYNC_CLIENTS = `${SYNC_ROUTE.BASE}/${SYNC_ROUTE.CLIENTS}`
export const API_SYNC_REGISTER_AUTH = `${SYNC_ROUTE.BASE}/${SYNC_ROUTE.REGISTER_AUTH}`
