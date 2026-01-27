/*
 * Copyright (C) 2012-2026 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

export interface AuthResult {
  success: boolean
  message: any
  twoFaEnabled?: boolean
}

export interface AuthOIDCQueryParams {
  oidc: string
  access_expiration: string
  refresh_expiration: string
}
