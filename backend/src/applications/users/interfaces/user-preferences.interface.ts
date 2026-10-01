import type { FileEditorProviders } from '../../files/editors/file-editor-providers.interface'
import { USER_SIDEBAR_QUICK_ACCESS_POSITION, USER_SIDEBAR_QUICK_ACCESS_VISIBILITY, USER_THEME } from '../constants/user-preferences'

export type UserTheme = Exclude<USER_THEME, USER_THEME.AUTO>

export interface UserPreferences {
  theme: USER_THEME
  editor: Exclude<keyof FileEditorProviders, 'drawio'> | null
  useSystemNotifications: boolean
  sidebarQuickAccessVisibility: USER_SIDEBAR_QUICK_ACCESS_VISIBILITY
  sidebarQuickAccessPosition: USER_SIDEBAR_QUICK_ACCESS_POSITION
}
