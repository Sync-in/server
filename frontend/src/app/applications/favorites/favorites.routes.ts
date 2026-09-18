import { Routes } from '@angular/router'
import { noUserLinkGuard } from '../users/user.guards'
import { FAVORITES_PATH } from './favorites.constants'

export const favoritesRoutes: Routes = [
  {
    path: FAVORITES_PATH.BASE,
    loadComponent: () => import('./components/favorites.component').then((c) => c.FavoritesComponent),
    canActivate: [noUserLinkGuard],
    data: { navbarViewSearch: true }
  }
]
