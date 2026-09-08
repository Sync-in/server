import { USER_MAX_PASSWORD_ATTEMPTS, USER_PASSWORD_ATTEMPTS_LOCK_DURATION_MS } from '@sync-in-server/backend/src/applications/users/constants/user'
import { API_USERS_AVATAR } from '@sync-in-server/backend/src/applications/users/constants/routes'

export function isUserTemporarilyLocked(isActive: boolean, passwordAttempts: number, currentAccess: Date | string): boolean {
  const currentAccessTimestamp = currentAccess ? (currentAccess instanceof Date ? currentAccess.getTime() : Date.parse(currentAccess)) : Number.NaN
  return (
    isActive &&
    (passwordAttempts ?? 0) >= USER_MAX_PASSWORD_ATTEMPTS &&
    Number.isFinite(currentAccessTimestamp) &&
    currentAccessTimestamp + USER_PASSWORD_ATTEMPTS_LOCK_DURATION_MS > Date.now()
  )
}

export function userAvatarUrl(login: string) {
  return `${API_USERS_AVATAR}/${login}`
}

export function myAvatarUrl() {
  return `${userAvatarUrl('me')}?random=${Math.floor(Math.random() * 1000)}`
}
