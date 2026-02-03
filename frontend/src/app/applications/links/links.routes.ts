import { Routes } from '@angular/router'
import { LINKS_PATH } from './links.constants'
import { LinkGuard } from './links.guard'

export const linksRoutes: Routes = [
  {
    path: LINKS_PATH.LINK,
    children: [
      {
        path: ':uuid',
        loadComponent: () => import('./components/public/public-link.component').then((c) => c.PublicLinkComponent),
        canActivate: [LinkGuard]
      },
      {
        path: `:uuid/${LINKS_PATH.AUTH}`,
        loadComponent: () => import('./components/public/public-link-auth.component').then((c) => c.PublicLinkAuthComponent)
      },
      { path: ':uuid/:error', loadComponent: () => import('./components/public/public-link-error.component').then((c) => c.PublicLinkErrorComponent) }
    ]
  }
]
