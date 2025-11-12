/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Routes } from '@angular/router'
import { routeResolver } from '../../common/resolvers/route.resolver'
import { userHaveDesktopAppPermission } from '../sync/sync.guards'
import { UserAccountComponent } from './components/user-account.component'
import { UserApplicationsComponent } from './components/user-applications.component'
import { UserGroupsComponent } from './components/user-groups.component'
import { USER_PATH } from './user.constants'
import { noUserLinkGuard, onlyUserGuard } from './user.guards'

export const userRoutes: Routes = [
  {
    path: USER_PATH.BASE,
    pathMatch: 'prefix',
    canActivate: [noUserLinkGuard],
    children: [
      { path: USER_PATH.ACCOUNT, component: UserAccountComponent },
      {
        path: USER_PATH.CLIENTS,
        canActivate: [userHaveDesktopAppPermission],
        loadComponent: () => import('../sync/components/sync-clients.component').then((c) => c.SyncClientsComponent)
      },
      {
        path: USER_PATH.GROUPS,
        children: [
          {
            path: '**',
            resolve: { routes: routeResolver },
            component: UserGroupsComponent
          }
        ]
      },
      {
        path: USER_PATH.GUESTS,
        canActivate: [onlyUserGuard],
        loadComponent: () => import('./components/user-guests.component').then((c) => c.UserGuestsComponent)
      },
      {
        path: USER_PATH.APPS,
        component: UserApplicationsComponent
      },
      { path: '**', redirectTo: USER_PATH.ACCOUNT }
    ]
  }
]
