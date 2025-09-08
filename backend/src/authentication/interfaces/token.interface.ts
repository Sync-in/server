/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

export enum TOKEN_TYPE {
  ACCESS = 'access',
  ACCESS_2FA = 'access_2fa',
  REFRESH = 'refresh',
  WS = 'ws',
  CSRF = 'csrf',
  CSRF_2FA = 'csrf_2fa'
}
