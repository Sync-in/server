import { USER_LOGIN_VALIDATION } from '../constants/user'

export function isSafePathSegment(value: unknown): value is string {
  return typeof value === 'string' && !!value && value !== '.' && value !== '..' && !value.includes('/') && !value.includes('\\')
}

export function isValidUserLogin(login: unknown): login is string {
  return isSafePathSegment(login) && USER_LOGIN_VALIDATION.test(login)
}

export function validateUserId(userId: number): void {
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new Error('User id must be a positive safe integer')
  }
}
