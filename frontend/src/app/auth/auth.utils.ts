import { HttpErrorResponse } from '@angular/common/http'
import { AUTH_RATE_LIMIT_ERROR_MESSAGE, AUTH_RATE_LIMIT_OPTIONS } from '@sync-in-server/backend/src/authentication/constants/auth'

export { AUTH_RATE_LIMIT_ERROR_MESSAGE }

export function getAuthRetryAfter(error: unknown): number | undefined {
  if (!(error instanceof HttpErrorResponse) || error.status !== 429) return undefined

  const retryAfter = Number.parseInt(error.headers.get('Retry-After') ?? '', 10)
  return retryAfter > 0 ? retryAfter : Math.ceil(AUTH_RATE_LIMIT_OPTIONS.blockDuration / 1000)
}

export function isDesktopRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes(AUTH_RATE_LIMIT_ERROR_MESSAGE)
}
