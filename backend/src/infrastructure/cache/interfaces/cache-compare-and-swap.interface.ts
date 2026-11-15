export interface CacheCompareAndSwapCommand {
  key: string
  expectedVersion: string | null
  // undefined deletes the key after the expected version check succeeds.
  value?: unknown
  ttl?: number
}
