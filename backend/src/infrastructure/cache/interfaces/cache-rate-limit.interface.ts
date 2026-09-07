export interface CacheRateLimitState {
  // Absolute expiration timestamps in milliseconds, including one per request.
  hits: number[]
  blockExpiresAt: number
}

export interface CacheRateLimitResult {
  totalHits: number
  // Remaining durations in seconds.
  timeToExpire: number
  isBlocked: boolean
  timeToBlockExpire: number
}
