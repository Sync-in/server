import { AUTH_SCOPE } from '../../../authentication/constants/scope.js'
import { USER_SECRET } from '../constants/user.js'

export interface UserAppPassword {
  name: string
  app: AUTH_SCOPE
  password: string
  expiration: Date
  currentIp: string
  lastIp: string
  currentAccess: Date
  lastAccess: Date
  createdAt: Date
}

export interface UserSecrets {
  [USER_SECRET.TWO_FA_SECRET]?: string
  [USER_SECRET.RECOVERY_CODES]?: string[]
  [USER_SECRET.APP_PASSWORDS]?: UserAppPassword[]
}
