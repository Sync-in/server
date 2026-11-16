import { toErrorMessage } from '../common/errors.js'
import { RETRYABLE_CONNECTION_ERROR_CODES } from './constants.js'

export function redactRedisUrl(url: string): string {
  const parsedUrl = new URL(url)
  if (!parsedUrl.password) return url

  parsedUrl.password = '********'
  return parsedUrl.toString()
}

export function isRetryableConnectionError(error: unknown): boolean {
  return isRetryableError(error, new Set<object>())
}

export function connectionErrorMessage(error: unknown): string {
  try {
    const errors = (error as { errors?: unknown[] })?.errors
    return (Array.isArray(errors) ? errors : [error]).map(String).join(', ')
  } catch {
    return toErrorMessage(error)
  }
}

function isRetryableError(error: unknown, parents: Set<object>): boolean {
  if (error === null || typeof error !== 'object') {
    return toErrorMessage(error).includes('Socket closed unexpectedly')
  }
  if (parents.has(error)) return false

  parents.add(error)
  try {
    if ('errors' in error && Array.isArray(error.errors) && error.errors.length > 0) {
      return error.errors.every((nestedError) => isRetryableError(nestedError, parents))
    }

    const code = 'code' in error && typeof error.code === 'string' ? error.code : undefined
    if ((code && RETRYABLE_CONNECTION_ERROR_CODES.has(code)) || toErrorMessage(error).includes('Socket closed unexpectedly')) {
      return true
    }

    return 'cause' in error && error.cause !== undefined ? isRetryableError(error.cause, parents) : false
  } catch {
    return false
  } finally {
    parents.delete(error)
  }
}
