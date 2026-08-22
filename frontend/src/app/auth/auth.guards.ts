import { inject } from '@angular/core'
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot } from '@angular/router'
import { Observable } from 'rxjs'
import { APP_PATH } from '../app.constants'
import { AuthOIDCQueryParams } from './auth.interface'
import { AuthService } from './auth.service'

export const authGuard: CanActivateFn = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean> => {
  // Authentication initiated via OIDC callback
  const authFromOIDC = route.queryParams?.oidc ? (route.queryParams as AuthOIDCQueryParams) : undefined
  return inject(AuthService).checkUserAuthAndLoad(state.url, authFromOIDC)
}

export const noAuthGuard: CanActivateFn = () => {
  if (inject(AuthService).isLogged()) {
    return inject(Router).createUrlTree([APP_PATH.HOME])
  }
  return true
}
