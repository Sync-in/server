import { Routes } from '@angular/router'
import { APP_PATH } from '../../app.constants'
import { FavoritesComponent } from './components/favorites.component'
import { FAVORITES_PATH } from './favorites.constants'

export const favoritesRoutes: Routes = [
  { path: APP_PATH.BASE, pathMatch: 'full', redirectTo: FAVORITES_PATH.BASE },
  { path: FAVORITES_PATH.BASE, component: FavoritesComponent }
]
