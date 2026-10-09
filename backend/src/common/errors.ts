export function toErrorMessage(error: unknown, fallback = 'Unknown error'): string {
  try {
    if (error instanceof Error) {
      return error.message || fallback
    }

    if (error !== null && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
      return error.message || fallback
    }

    if (error === null || error === undefined) return fallback

    return String(error) || fallback
  } catch {
    return fallback
  }
}
