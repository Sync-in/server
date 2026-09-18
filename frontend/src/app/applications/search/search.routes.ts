import { Routes } from '@angular/router'
import { SEARCH_PATH } from './search.constants'

export const searchRoutes: Routes = [
  {
    path: SEARCH_PATH.BASE,
    loadComponent: () => import('./components/search.component').then((c) => c.SearchComponent),
    data: { navbarViewSearch: true }
  }
]
