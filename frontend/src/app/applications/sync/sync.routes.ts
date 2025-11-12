/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Routes } from '@angular/router'
import { SYNC_PATH } from './sync.constants'
import { syncWizardServerActivate, syncWizardSettingsActivate, userHaveDesktopAppSyncPermission } from './sync.guards'
import { syncPathsResolver } from './sync.resolvers'

export const syncRoutes: Routes = [
  {
    path: SYNC_PATH.BASE,
    pathMatch: 'prefix',
    canActivate: [userHaveDesktopAppSyncPermission],
    resolve: [syncPathsResolver],
    children: [
      { path: '', pathMatch: 'full', redirectTo: SYNC_PATH.PATHS },
      {
        path: SYNC_PATH.PATHS,
        pathMatch: 'full',
        loadComponent: () => import('./components/sync-paths.component').then((c) => c.SyncPathsComponent)
      },
      {
        path: SYNC_PATH.TRANSFERS,
        pathMatch: 'full',
        loadComponent: () => import('./components/sync-transfers.component').then((c) => c.SyncTransfersComponent)
      },
      { path: SYNC_PATH.WIZARD, pathMatch: 'full', redirectTo: `${SYNC_PATH.WIZARD}/${SYNC_PATH.WIZARD_CLIENT}` },
      {
        path: `${SYNC_PATH.WIZARD}/${SYNC_PATH.WIZARD_CLIENT}`,
        pathMatch: 'full',
        loadComponent: () => import('./components/wizard/sync-wizard-client.component').then((c) => c.SyncWizardClientComponent)
      },
      {
        path: `${SYNC_PATH.WIZARD}/${SYNC_PATH.WIZARD_SERVER}`,
        canActivate: [syncWizardServerActivate],
        pathMatch: 'full',
        loadComponent: () => import('./components/wizard/sync-wizard-server.component').then((c) => c.SyncWizardServerComponent)
      },
      {
        path: `${SYNC_PATH.WIZARD}/${SYNC_PATH.WIZARD_SETTINGS}`,
        canActivate: [syncWizardSettingsActivate],
        pathMatch: 'full',
        loadComponent: () => import('./components/wizard/sync-wizard-settings.component').then((c) => c.SyncWizardSettingsComponent)
      }
    ]
  }
]
