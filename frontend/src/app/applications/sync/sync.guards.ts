/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { inject } from '@angular/core'
import { CanActivateFn, Router } from '@angular/router'
import { USER_PERMISSION } from '@sync-in-server/backend/src/applications/users/constants/user'
import { UserService } from '../users/user.service'
import { SyncService } from './services/sync.service'
import { SYNC_PATH } from './sync.constants'

export const userHaveDesktopAppPermission: CanActivateFn = (): boolean => {
  return inject(UserService).userHavePermission(USER_PERMISSION.DESKTOP_APP)
}

export const userHaveDesktopAppSyncPermission: CanActivateFn = (): boolean => {
  const userService = inject(UserService)
  return userService.userHavePermission(USER_PERMISSION.DESKTOP_APP_SYNC) && !!userService.user.clientId
}

export const syncWizardSettingsActivate: CanActivateFn = (): boolean => {
  const syncService = inject(SyncService)
  const canActivate = Boolean(syncService.wizard.localPath && syncService.wizard.remotePath)
  if (!canActivate) {
    inject(Router)
      .navigate([SYNC_PATH.BASE, SYNC_PATH.WIZARD, syncService.wizard.localPath ? SYNC_PATH.WIZARD_SERVER : SYNC_PATH.WIZARD_CLIENT])
      .catch(console.error)
  }
  return canActivate
}

export const syncWizardServerActivate: CanActivateFn = (): boolean => {
  const syncService = inject(SyncService)
  const canActivate = Boolean(syncService.wizard.localPath)
  if (!canActivate) {
    inject(Router)
      .navigate([SYNC_PATH.BASE, SYNC_PATH.WIZARD, SYNC_PATH.WIZARD_CLIENT])
      .catch(console.error)
  }
  return canActivate
}
