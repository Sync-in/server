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

// Moves an entry out of the regular menu flow into a dedicated visual area.
export type AppMenuPlacement = 'bottom'

export interface AppMenuSeparator {
  separator: true
  // When provided, the separator is rendered as a section label instead of a line.
  title?: string
  // Use "bottom" for entries such as Trash that should be pinned at the bottom of the sidebar menu.
  placement?: AppMenuPlacement
  // Extends the separator line across the full sidebar menu width.
  wide?: boolean
}

// Sidebar submenus can contain real navigation entries and visual separators.
export type AppMenuEntry = AppMenu | AppMenuSeparator

export function isAppMenuSeparator(menu: AppMenuEntry): menu is AppMenuSeparator {
  return 'separator' in menu && menu.separator
}

export function isAppMenu(menu: AppMenuEntry): menu is AppMenu {
  return !isAppMenuSeparator(menu)
}

export interface AppMenu {
  id?: USER_PERMISSION
  title: string
  icon: IconDefinition
  iconAnimated?: boolean
  link: string
  matchLink?: RegExp
  // Allows a parent menu link to target the first visible preferred child instead of the first visible child.
  defaultLinkCandidate?: boolean
  // Use "bottom" for entries such as Trash that should be pinned at the bottom of the sidebar menu.
  placement?: AppMenuPlacement
  isActive?: boolean
  hide?: boolean
  count?: { value: Observable<any> & BehaviorSubject<any>; level: string }
  // prop must be an attribute of the userService
  checks?: { negate?: boolean; prop: 'user'; value: UserStatus }[]
  submenus?: AppMenuEntry[]
  hasSubmenus?: boolean
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
