import { Routes } from '@angular/router'
import { noUserLinkGuard } from '../users/user.guards'
import { FavoritesComponent } from './components/favorites.component'
import { FAVORITES_PATH } from './favorites.constants'

export const favoritesRoutes: Routes = [{ path: FAVORITES_PATH.BASE, component: FavoritesComponent, canActivate: [noUserLinkGuard] }]
