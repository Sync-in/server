import { Routes } from '@angular/router'
import { SearchComponent } from './components/search.component'
import { SEARCH_PATH } from './search.constants'

export const searchRoutes: Routes = [{ path: SEARCH_PATH.BASE, component: SearchComponent }]
