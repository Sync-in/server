import { inject } from '@angular/core'
import { ActivatedRouteSnapshot, ResolveFn, UrlSegment } from '@angular/router'
import { StoreService } from '../../store/store.service'

export const spacesResolver: ResolveFn<any> = (route: ActivatedRouteSnapshot): UrlSegment[] => {
  inject(StoreService).repository.set(route.data.repository)
  return route.url
}
