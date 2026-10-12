import type { User } from '../schemas/user.interface.js'
import type { Member } from './member.interface.js'

export type GuestUser = Partial<User> & {
  id: number
  login: string
  email: string
  role: number
  fullName: string
  managers?: Member[]
  groups?: Member[]
}
