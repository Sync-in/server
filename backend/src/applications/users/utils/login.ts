const USER_LOGIN_VALIDATION = /^(?! )(?!.* $)[a-zA-Z0-9@\-._ ]{2,255}$/

export function isSafePathSegment(value: unknown): value is string {
  return typeof value === 'string' && !!value && value !== '.' && value !== '..' && !value.includes('/') && !value.includes('\\')
}

export function isValidUserLogin(login: unknown): login is string {
  return isSafePathSegment(login) && USER_LOGIN_VALIDATION.test(login)
}
