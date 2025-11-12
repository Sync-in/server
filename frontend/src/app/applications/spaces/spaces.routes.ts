/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Routes } from '@angular/router'
import { LinksComponent } from '../links/components/links.component'
import { SharedComponent } from '../shares/components/shared.component'
import { SpacesBrowserComponent } from './components/spaces-browser.component'
import { SpacesNavComponent } from './components/spaces-nav.component'
import { SpacesComponent } from './components/spaces.component'
import { TrashComponent } from './components/trash.component'
import { SPACES_PATH } from './spaces.constants'
import { spacesResolver } from './spaces.resolvers'

export const spacesRoutes: Routes = [
  {
    path: '',
    component: SpacesNavComponent,
    children: [
      {
        path: SPACES_PATH.SPACES,
        pathMatch: 'full',
        component: SpacesComponent,
        resolve: { routes: spacesResolver },
        data: { repository: SPACES_PATH.SPACES }
      },
      {
        path: SPACES_PATH.TRASH,
        pathMatch: 'full',
        component: TrashComponent,
        resolve: { routes: spacesResolver },
        data: { repository: SPACES_PATH.TRASHES }
      },
      {
        path: SPACES_PATH.SHARED,
        pathMatch: 'full',
        component: SharedComponent,
        resolve: { routes: spacesResolver },
        data: { repository: SPACES_PATH.SHARED }
      },
      {
        path: SPACES_PATH.LINKS,
        pathMatch: 'full',
        component: LinksComponent,
        resolve: { routes: spacesResolver },
        data: { repository: SPACES_PATH.LINKS }
      },
      {
        path: SPACES_PATH.SPACES_FILES,
        children: [
          {
            path: '**',
            component: SpacesBrowserComponent,
            resolve: { routes: spacesResolver },
            data: { repository: SPACES_PATH.FILES }
          }
        ]
      },
      {
        path: SPACES_PATH.SPACES_SHARES,
        children: [
          {
            path: '**',
            component: SpacesBrowserComponent,
            resolve: { routes: spacesResolver },
            data: { repository: SPACES_PATH.SHARES }
          }
        ]
      },
      {
        path: SPACES_PATH.SPACES_TRASH,
        children: [
          {
            path: '**',
            component: SpacesBrowserComponent,
            resolve: { routes: spacesResolver },
            data: { repository: SPACES_PATH.TRASH }
          }
        ]
      }
    ]
  }
]
