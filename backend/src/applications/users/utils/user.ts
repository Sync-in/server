import { USER_THEME } from '../constants/user-preferences'
import type { UserPreferences } from '../interfaces/user-preferences.interface'

export function normalizeUserPreferences(preferences?: Partial<UserPreferences> | null): UserPreferences {
  return {
    theme: preferences?.theme ?? USER_THEME.AUTO,
    editor: preferences?.editor ?? null,
    useSystemNotifications: preferences?.useSystemNotifications ?? true
  }
}
