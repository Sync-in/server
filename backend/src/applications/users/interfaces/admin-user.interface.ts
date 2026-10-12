import type { User } from '../schemas/user.interface.js'
import type { Member } from './member.interface.js'

export type AdminUser = Partial<User> &
  Required<Pick<User, 'id' | 'login' | 'email' | 'role'>> & { fullName: string; groups?: Member[]; twoFaEnabled?: boolean }
