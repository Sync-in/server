import type { User } from '../schemas/user.interface'
import type { Member } from './member.interface'

export type GuestUser = Partial<User> & {
  fullName: string
  managers?: Member[]
}
