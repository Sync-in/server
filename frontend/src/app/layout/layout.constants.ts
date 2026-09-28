import { LucideContrast, LucideMoon, LucideSun } from '@lucide/angular'
import { USER_THEME } from '@sync-in-server/backend/src/applications/users/constants/user-preferences'

export const tableTrSelectedClass = '.selected'
export const dragClass = 'drag-over'
export const defaultCardImageSize = 80
export const defaultResizeOffset = 85

export const THEME_OPTIONS = [
  { value: USER_THEME.AUTO, label: 'Auto', icon: LucideContrast },
  { value: USER_THEME.DARK, label: 'Dark', icon: LucideMoon },
  { value: USER_THEME.LIGHT, label: 'Light', icon: LucideSun }
] as const
