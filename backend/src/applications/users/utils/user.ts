import { USER_SIDEBAR_QUICK_ACCESS_POSITION, USER_SIDEBAR_QUICK_ACCESS_VISIBILITY, USER_THEME } from '../constants/user-preferences.js'
import type { UserPreferences } from '../interfaces/user-preferences.interface.js'

export function normalizeUserPreferences(preferences?: Partial<UserPreferences> | null): UserPreferences {
  return {
    theme: preferences?.theme ?? USER_THEME.AUTO,
    editor: preferences?.editor ?? null,
    useSystemNotifications: preferences?.useSystemNotifications ?? true,
    sidebarQuickAccessVisibility: preferences?.sidebarQuickAccessVisibility ?? USER_SIDEBAR_QUICK_ACCESS_VISIBILITY.BOTH,
    sidebarQuickAccessPosition: preferences?.sidebarQuickAccessPosition ?? USER_SIDEBAR_QUICK_ACCESS_POSITION.TOP
  }
}
