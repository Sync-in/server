import type { LucideIcon } from '@lucide/angular'

export enum NAVBAR_SEARCH_MODE {
  VIEW = 'view',
  NAME = 'name',
  CONTENT = 'content'
}

export type NavbarGlobalSearchMode = NAVBAR_SEARCH_MODE.NAME | NAVBAR_SEARCH_MODE.CONTENT

export interface NavbarGlobalSearch {
  content: string
  mode: NavbarGlobalSearchMode
}

export interface NavbarSearchOption {
  mode: NAVBAR_SEARCH_MODE
  label: string
  shortcut: string
  icon: LucideIcon
}

export function isNavbarGlobalSearchMode(mode: NAVBAR_SEARCH_MODE): mode is NavbarGlobalSearchMode {
  return mode === NAVBAR_SEARCH_MODE.NAME || mode === NAVBAR_SEARCH_MODE.CONTENT
}
