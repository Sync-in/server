import type { UserSecrets } from '../interfaces/user-secrets.interface'
import type { users } from './users.schema'

type UserSchema = typeof users.$inferSelect

export class User implements UserSchema {
  id: number
  email: string
  login: string
  firstName: string
  lastName: string
  password: string
  role: number
  isActive: boolean
  secrets: UserSecrets
  language: string
  permissions: string
  storageUsage: number
  storageQuota: number
  storageIndexing: boolean
  notification: number
  onlineStatus: number
  passwordAttempts: number
  currentIp: string
  lastIp: string
  currentAccess: Date
  lastAccess: Date
  createdAt: Date
}
