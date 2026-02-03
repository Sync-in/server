import { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { USER_PERMISSION } from '@sync-in-server/backend/src/applications/users/constants/user'
import { BehaviorSubject, Observable } from 'rxjs'
import { UserStatus } from '../applications/users/interfaces/user.interface'

export const themeDark = 'theme-dark'
export const themeLight = 'theme-light'

export enum TAB_GROUP {
  FILES = 'files'
}

export enum TAB_MENU {
  PROFILE = 'profile',
  ONLINES = 'onlines',
  TASKS = 'tasks',
  WINDOWS = 'windows',
  SELECTION = 'selection',
  TREE = 'tree',
  CLIPBOARD = 'clipboard',
  COMMENTS = 'comments',
  NOTIFICATIONS = 'notifications'
}

export interface AppMenu {
  id?: USER_PERMISSION
  title: string
  icon: IconDefinition
  iconAnimated?: boolean
  link: string
  matchLink?: RegExp
  isActive?: boolean
  miniOpened?: boolean
  level?: number
  hide?: boolean
  count?: { value: Observable<any> & BehaviorSubject<any>; level: string }
  // prop must be an attribute of the userService
  checks?: { negate?: boolean; prop: 'user'; value: UserStatus }[]
  submenus?: AppMenu[]
  component?: any
}

export interface TabMenu {
  label: string
  // load component even if not showed
  loadComponent?: boolean
  components: any[]
  icon: IconDefinition | null
  title: string | null
  active: boolean
  firstOfLasts?: boolean
  showOnCount?: boolean
  count?: { value: Observable<any>; level: string }
}

export interface AppWindow {
  id: number | string
  element: { name: string; mimeUrl: string }
}
