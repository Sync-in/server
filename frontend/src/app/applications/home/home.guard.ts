import { inject } from '@angular/core'
import { CanActivateFn, Router } from '@angular/router'
import { UserService } from '../users/user.service'

export const homeGuard: CanActivateFn = () => {
  // The parent auth guard has initialized the user before this permission-based redirect runs.
  const defaultLandingPath = inject(UserService).getDefaultLandingPath()
  return inject(Router).createUrlTree([defaultLandingPath])
}
