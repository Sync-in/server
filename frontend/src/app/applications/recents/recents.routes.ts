import { Routes } from '@angular/router'
import { RECENTS_PATH } from './recents.constants'

export const recentsRoutes: Routes = [
  { path: RECENTS_PATH.BASE, loadComponent: () => import('./components/recents.component').then((c) => c.RecentsComponent) }
]
