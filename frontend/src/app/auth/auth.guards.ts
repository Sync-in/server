/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { inject } from '@angular/core'
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot } from '@angular/router'
import { Observable } from 'rxjs'
import { AuthService } from './auth.service'

export const authGuard: CanActivateFn = (_route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean> => {
  return inject(AuthService).checkUserAuthAndLoad(state.url)
}

export const noAuthGuard: CanActivateFn = (): boolean => {
  if (inject(AuthService).isLogged()) {
    inject(Router).navigate([]).catch(console.error)
    return false
  }
  return true
}
