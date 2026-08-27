import type { LucideIcon } from '@lucide/angular'
import { LucideSearch } from '@lucide/angular'
import { AppMenu } from '../../layout/layout.interfaces'

export const SEARCH_PATH = {
  BASE: 'search'
} as const

export const SEARCH_TITLE = 'Search'
export const SEARCH_ICON: LucideIcon = LucideSearch

export const SEARCH_MENU: AppMenu = {
  title: SEARCH_TITLE,
  link: SEARCH_PATH.BASE,
  icon: SEARCH_ICON,
  submenus: []
} as const
