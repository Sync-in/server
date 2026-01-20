/*
 * Copyright (C) 2012-2026 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { inject } from '@angular/core'
import { ResolveFn } from '@angular/router'
import type { AuthOIDCSettings } from '@sync-in-server/backend/src/authentication/providers/oidc/auth-oidc.interfaces'
import { AuthService } from './auth.service'

export const authResolver: ResolveFn<AuthOIDCSettings | false> = () => {
  return inject(AuthService).getAuthSettings()
}
