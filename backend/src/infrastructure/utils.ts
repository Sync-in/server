import { RETRYABLE_CONNECTION_ERROR_CODES } from './constants'

export function redactRedisUrl(url: string): string {
  const parsedUrl = new URL(url)
  if (!parsedUrl.password) return url

  parsedUrl.password = '********'
  return parsedUrl.toString()
}

export function isRetryableConnectionError(error: unknown): boolean {
  const errors = connectionErrors(error)
  return errors.length > 0 && errors.every((currentError) => isRetryableError(currentError))
}

export function connectionErrorMessage(error: unknown): string {
  return connectionErrors(error).map(String).join(', ')
}

function connectionErrors(error: unknown): unknown[] {
  const errors = (error as { errors?: unknown[] })?.errors
  return Array.isArray(errors) ? errors : [error]
}

function isRetryableError(error: unknown): boolean {
  const code = (error as { code?: string })?.code
  const message = error instanceof Error ? error.message : String(error)
  return (!!code && RETRYABLE_CONNECTION_ERROR_CODES.has(code)) || message.includes('Socket closed unexpectedly')
}
