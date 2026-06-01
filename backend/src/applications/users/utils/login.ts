import { USER_LOGIN_VALIDATION } from '../constants/user'

export function isSafePathSegment(value: unknown): value is string {
  return typeof value === 'string' && !!value && value !== '.' && value !== '..' && !value.includes('/') && !value.includes('\\')
}

export function isValidUserLogin(login: unknown): login is string {
  return isSafePathSegment(login) && USER_LOGIN_VALIDATION.test(login)
}
