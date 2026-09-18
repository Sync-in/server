import { Routes } from '@angular/router'
import { routeResolver } from '../../common/resolvers/route.resolver'
import { userHaveDesktopAppPermission } from '../sync/sync.guards'
import { USER_PATH } from './user.constants'
import { noUserLinkGuard, onlyUserGuard } from './user.guards'

export const userRoutes: Routes = [
  {
    path: USER_PATH.BASE,
    pathMatch: 'prefix',
    canActivate: [noUserLinkGuard],
    children: [
      {
        path: USER_PATH.ACCOUNT,
        loadComponent: () => import('./components/user-account.component').then((c) => c.UserAccountComponent)
      },
      {
        path: USER_PATH.CLIENTS,
        canActivate: [userHaveDesktopAppPermission],
        loadComponent: () => import('../sync/components/sync-clients.component').then((c) => c.SyncClientsComponent)
      },
      {
        path: USER_PATH.GROUPS,
        children: [
          {
            path: '**',
            resolve: { routes: routeResolver },
            data: { navbarViewSearch: true },
            loadComponent: () => import('./components/user-groups.component').then((c) => c.UserGroupsComponent)
          }
        ]
      },
      {
        path: USER_PATH.GUESTS,
        canActivate: [onlyUserGuard],
        loadComponent: () => import('./components/user-guests.component').then((c) => c.UserGuestsComponent),
        data: { navbarViewSearch: true }
      },
      {
        path: USER_PATH.APPS,
        loadComponent: () => import('./components/user-applications.component').then((c) => c.UserApplicationsComponent)
      },
      { path: '**', redirectTo: USER_PATH.ACCOUNT }
    ]
  }
]
