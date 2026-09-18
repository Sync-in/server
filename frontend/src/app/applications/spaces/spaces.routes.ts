import { Routes } from '@angular/router'
import { SPACES_PATH } from './spaces.constants'
import { spacesResolver } from './spaces.resolvers'

const loadSpacesBrowserComponent = () => import('./components/spaces-browser.component').then((c) => c.SpacesBrowserComponent)

export const spacesRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/spaces-nav.component').then((c) => c.SpacesNavComponent),
    children: [
      {
        path: SPACES_PATH.SPACES,
        pathMatch: 'full',
        loadComponent: () => import('./components/spaces.component').then((c) => c.SpacesComponent),
        resolve: { routes: spacesResolver },
        data: { repository: SPACES_PATH.SPACES, navbarViewSearch: true }
      },
      {
        path: SPACES_PATH.TRASH,
        pathMatch: 'full',
        loadComponent: () => import('./components/trash.component').then((c) => c.TrashComponent),
        resolve: { routes: spacesResolver },
        data: { repository: SPACES_PATH.TRASHES, navbarViewSearch: true }
      },
      {
        path: SPACES_PATH.SHARED,
        pathMatch: 'full',
        loadComponent: () => import('../shares/components/shared.component').then((c) => c.SharedComponent),
        resolve: { routes: spacesResolver },
        data: { repository: SPACES_PATH.SHARED, navbarViewSearch: true }
      },
      {
        path: SPACES_PATH.LINKS,
        pathMatch: 'full',
        loadComponent: () => import('../links/components/links.component').then((c) => c.LinksComponent),
        resolve: { routes: spacesResolver },
        data: { repository: SPACES_PATH.LINKS, navbarViewSearch: true }
      },
      {
        path: SPACES_PATH.SPACES_FILES,
        children: [
          {
            path: '**',
            loadComponent: loadSpacesBrowserComponent,
            resolve: { routes: spacesResolver },
            data: { repository: SPACES_PATH.FILES, navbarViewSearch: true }
          }
        ]
      },
      {
        path: SPACES_PATH.SPACES_SHARES,
        children: [
          {
            path: '**',
            loadComponent: loadSpacesBrowserComponent,
            resolve: { routes: spacesResolver },
            data: { repository: SPACES_PATH.SHARES, navbarViewSearch: true }
          }
        ]
      },
      {
        path: SPACES_PATH.SPACES_TRASH,
        children: [
          {
            path: '**',
            loadComponent: loadSpacesBrowserComponent,
            resolve: { routes: spacesResolver },
            data: { repository: SPACES_PATH.TRASH, navbarViewSearch: true }
          }
        ]
      }
    ]
  }
]
