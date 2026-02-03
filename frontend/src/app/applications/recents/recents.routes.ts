import { Routes } from '@angular/router'
import { APP_PATH } from '../../app.constants'
import { RecentsComponent } from './components/recents.component'
import { RECENTS_PATH } from './recents.constants'

export const recentsRoutes: Routes = [
  { path: APP_PATH.BASE, pathMatch: 'full', redirectTo: RECENTS_PATH.BASE },
  { path: RECENTS_PATH.BASE, component: RecentsComponent }
]
