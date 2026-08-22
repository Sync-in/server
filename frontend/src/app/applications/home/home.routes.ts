import { Routes } from '@angular/router'
import { APP_PATH } from '../../app.constants'
import { HomeComponent } from './home.component'
import { homeGuard } from './home.guard'

export const homeRoutes: Routes = [
  { path: APP_PATH.BASE, pathMatch: 'full', redirectTo: APP_PATH.HOME },
  { path: APP_PATH.HOME, component: HomeComponent, canActivate: [homeGuard] }
]
