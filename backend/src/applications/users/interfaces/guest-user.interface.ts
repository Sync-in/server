import type { User } from '../schemas/user.interface.js'
import type { Member } from './member.interface.js'

export type GuestUser = Partial<User> & {
  fullName: string
  managers?: Member[]
  groups?: Member[]
}
