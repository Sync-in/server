import { inject } from '@angular/core'
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot } from '@angular/router'
import { Observable } from 'rxjs'
import { AuthOIDCQueryParams } from './auth.interface'
import { AuthService } from './auth.service'

export const authGuard: CanActivateFn = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean> => {
  // Authentication initiated via OIDC callback
  const authFromOIDC = route.queryParams?.oidc ? (route.queryParams as AuthOIDCQueryParams) : undefined
  return inject(AuthService).checkUserAuthAndLoad(state.url, authFromOIDC)
}

export const noAuthGuard: CanActivateFn = (): boolean => {
  if (inject(AuthService).isLogged()) {
    inject(Router).navigate([]).catch(console.error)
    return false
  }
  return true
}
