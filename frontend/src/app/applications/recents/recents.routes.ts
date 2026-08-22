import { Routes } from '@angular/router'
import { RecentsComponent } from './components/recents.component'
import { RECENTS_PATH } from './recents.constants'

export const recentsRoutes: Routes = [{ path: RECENTS_PATH.BASE, component: RecentsComponent }]
