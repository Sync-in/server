import { Routes } from '@angular/router'
import { authResolver } from './auth-resolvers'
import { AuthComponent } from './auth.component'
import { AUTH_PATHS } from './auth.constants'
import { noAuthGuard } from './auth.guards'

export const authRoutes: Routes = [
  {
    path: AUTH_PATHS.BASE,
    canActivate: [noAuthGuard],
    resolve: { authSettings: authResolver },
    children: [{ path: AUTH_PATHS.LOGIN, component: AuthComponent }]
  }
]
