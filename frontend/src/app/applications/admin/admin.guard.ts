import { inject } from '@angular/core'
import { CanActivateFn } from '@angular/router'
import { UserService } from '../users/user.service'

export const adminGuard: CanActivateFn = (): boolean => {
  return inject(UserService).user.isAdmin
}
