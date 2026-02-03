import { ActivatedRouteSnapshot, ResolveFn, UrlSegment } from '@angular/router'

export const routeResolver: ResolveFn<any> = (route: ActivatedRouteSnapshot): UrlSegment[] => {
  return route.url
}
