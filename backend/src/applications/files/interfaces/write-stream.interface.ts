import type { UploadFileStreamLimiter } from './upload-file.interface'

export interface WriteFromStreamOptions {
  start?: number
  signal?: AbortSignal
  // Called before forwarding a chunk to the destination. Throwing aborts the pipeline.
  accountBytes?: (bytes: number) => void
}

export interface WriteUploadStreamOptions {
  limiter: UploadFileStreamLimiter
  signal?: AbortSignal
  // Receives only bytes accepted by the limiter.
  onProgress?: (bytes: number) => void
}
