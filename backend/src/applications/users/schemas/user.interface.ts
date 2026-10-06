import type { UserPreferences } from '../interfaces/user-preferences.interface.js'
import type { UserSecrets } from '../interfaces/user-secrets.interface.js'
import type { users } from './users.schema.js'

type UserSchema = typeof users.$inferSelect

export class User implements UserSchema {
  id: number
  email: string
  login: string
  externalId: string | null
  firstName: string
  lastName: string
  password: string
  role: number
  isActive: boolean
  secrets: UserSecrets
  preferences: UserPreferences
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
