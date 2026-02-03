import { inject } from '@angular/core'
import { ResolveFn } from '@angular/router'
import type { AuthOIDCSettings } from '@sync-in-server/backend/src/authentication/providers/oidc/auth-oidc.interfaces'
import { AuthService } from './auth.service'

export const authResolver: ResolveFn<AuthOIDCSettings | false> = () => {
  return inject(AuthService).getAuthSettings()
}
