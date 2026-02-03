import { inject } from '@angular/core'
import { ActivatedRouteSnapshot, CanActivateFn } from '@angular/router'
import { SpaceLink } from '@sync-in-server/backend/src/applications/links/interfaces/link-space.interface'
import { Observable, of, switchMap } from 'rxjs'
import { LinksService } from './services/links.service'

export const LinkGuard: CanActivateFn = (route: ActivatedRouteSnapshot): Observable<boolean> => {
  return inject(LinksService)
    .linkValidation(route.params.uuid)
    .pipe(
      switchMap((r: false | SpaceLink) => {
        if (r === false) return of(false)
        route.data = { ...route.data, link: r }
        return of(true)
      })
    )
}
