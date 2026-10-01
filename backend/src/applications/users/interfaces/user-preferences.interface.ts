import type { FileEditorProviders } from '../../files/editors/file-editor-providers.interface'
import { USER_THEME } from '../constants/user-preferences'

export type UserTheme = Exclude<USER_THEME, USER_THEME.AUTO>

export interface UserPreferences {
  theme: USER_THEME
  editor: Exclude<keyof FileEditorProviders, 'drawio'> | null
  useSystemNotifications: boolean
}
