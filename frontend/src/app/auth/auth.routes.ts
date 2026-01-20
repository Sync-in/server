/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Routes } from '@angular/router'
import { authResolver } from './auth-resolvers'
import { AuthComponent } from './auth.component'
import { AUTH_PATHS } from './auth.constants'
import { noAuthGuard } from './auth.guards'

export const authRoutes: Routes = [
  {
    path: AUTH_PATHS.BASE,
    canActivate: [noAuthGuard],
    resolve: { authSettings: authResolver },
    children: [{ path: AUTH_PATHS.LOGIN, component: AuthComponent }]
  }
]
