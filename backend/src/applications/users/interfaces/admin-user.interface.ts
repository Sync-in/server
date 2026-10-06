import type { User } from '../schemas/user.interface.js'
import type { Member } from './member.interface.js'

export type AdminUser = Partial<User> & { fullName: string; groups?: Member[]; twoFaEnabled?: boolean }
