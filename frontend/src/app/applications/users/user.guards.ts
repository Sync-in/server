import { inject } from '@angular/core'
import { CanActivateFn } from '@angular/router'
import { UserService } from './user.service'

export const noUserLinkGuard: CanActivateFn = (): boolean => {
  return !inject(UserService).user.isLink
}

export const onlyUserGuard: CanActivateFn = (): boolean => {
  return inject(UserService).user.isUser
}
