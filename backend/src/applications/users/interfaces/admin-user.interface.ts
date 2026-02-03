import type { User } from '../schemas/user.interface'
import type { Member } from './member.interface'

export type AdminUser = Partial<User> & { fullName: string; groups?: Member[]; twoFaEnabled?: boolean }
