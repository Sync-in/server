export interface UploadFileStreamLimiter {
  readonly initialFileSize: number
  // Checks the number of bytes the current stream is expected to append.
  assertKnownSize: (bytes: number) => void
  // Checks the expected final file size, including the current range offset.
  assertFinalSize: (bytes: number) => void
  consume: (bytes: number) => void
}

export interface UploadQuotaSnapshot {
  storageQuota?: number | null
  storageUsage?: number
}
