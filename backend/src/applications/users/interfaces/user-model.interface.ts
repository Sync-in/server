import type { User } from '../schemas/user.interface.js'
import type { UserPreferences } from './user-preferences.interface.js'

export type UserModelProps = Omit<Partial<User>, 'preferences'> & {
  preferences?: Partial<UserPreferences> | null
  exp?: number
  twoFaEnabled?: boolean
}
