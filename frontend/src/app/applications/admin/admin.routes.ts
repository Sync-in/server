import { Routes } from '@angular/router'
import { GROUP_TYPE } from '@sync-in-server/backend/src/applications/users/constants/group'
import { USER_ROLE } from '@sync-in-server/backend/src/applications/users/constants/user'
import { routeResolver } from '../../common/resolvers/route.resolver'
import { ADMIN_PATH } from './admin.constants'
import { adminGuard } from './admin.guard'

export const adminRoutes: Routes = [
  {
    path: ADMIN_PATH.BASE,
    pathMatch: 'prefix',
    canActivate: [adminGuard],
    children: [
      {
        path: ADMIN_PATH.USERS,
        data: { type: USER_ROLE.USER, navbarViewSearch: true },
        loadComponent: () => import('./components/admin-users.component').then((c) => c.AdminUsersComponent)
      },
      {
        path: ADMIN_PATH.GUESTS,
        data: { type: USER_ROLE.GUEST, navbarViewSearch: true },
        loadComponent: () => import('./components/admin-users.component').then((c) => c.AdminUsersComponent)
      },
      {
        path: ADMIN_PATH.GROUPS,
        children: [
          {
            path: '**',
            resolve: { routes: routeResolver },
            data: { type: GROUP_TYPE.USER, navbarViewSearch: true },
            loadComponent: () => import('./components/admin-groups.component').then((c) => c.AdminGroupsComponent)
          }
        ]
      },
      {
        path: ADMIN_PATH.PGROUPS,
        children: [
          {
            path: '**',
            resolve: { routes: routeResolver },
            data: { type: GROUP_TYPE.PERSONAL, navbarViewSearch: true },
            loadComponent: () => import('./components/admin-groups.component').then((c) => c.AdminGroupsComponent)
          }
        ]
      },
      {
        path: ADMIN_PATH.SPACES,
        children: [
          {
            path: '**',
            resolve: { routes: routeResolver },
            data: { navbarViewSearch: true },
            loadComponent: () => import('./components/admin-spaces.component').then((c) => c.AdminSpacesComponent)
          }
        ]
      },
      {
        path: ADMIN_PATH.TOOLS,
        loadComponent: () => import('./components/admin-tools.component').then((c) => c.AdminToolsComponent)
      },
      { path: '**', redirectTo: ADMIN_PATH.USERS }
    ]
  }
]
