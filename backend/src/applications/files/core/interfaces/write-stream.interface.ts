import type { UploadFileStreamLimiter } from './upload-file.interface.js'

export interface WriteFromStreamOptions {
  exclusive?: boolean
  start?: number
  signal?: AbortSignal
  // Called before forwarding a chunk to the destination. Throwing aborts the pipeline.
  accountBytes?: (bytes: number) => void
}

export interface WriteUploadStreamOptions {
  exclusive?: boolean
  limiter: UploadFileStreamLimiter
  signal?: AbortSignal
  // Receives only bytes accepted by the limiter.
  onProgress?: (bytes: number) => void
}
