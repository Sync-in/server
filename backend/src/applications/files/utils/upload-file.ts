import { HttpStatus } from '@nestjs/common'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { FileError } from '../models/file-error'
import { maxFileSizeExceededError, storageQuotaExceededError } from './errors'
import { temporaryPathPrefix } from './files'

const FASTIFY_MULTIPART_FILE_TOO_LARGE_CODE = 'FST_REQ_FILE_TOO_LARGE' as const

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

/**
 * Request-scoped upload limiter. It deliberately does not coordinate quota
 * reservations between concurrent requests or workers.
 */
export class UploadStreamLimiter {
  // Shared by all file limiters created for the same request, notably multipart uploads.
  private quotaConsumed = 0

  constructor(
    private readonly maxFileSize: number,
    private readonly quotaRemaining?: number
  ) {}

  createFileLimiter(initialFileSize = 0): UploadFileStreamLimiter {
    if (!Number.isSafeInteger(initialFileSize) || initialFileSize < 0) {
      throw new FileError(HttpStatus.BAD_REQUEST, 'Invalid upload size')
    }
    if (initialFileSize > this.maxFileSize) {
      throw maxFileSizeExceededError()
    }

    // A resumed offset counts toward maxFileSize but is not charged again against the quota snapshot.
    let fileSize = initialFileSize
    const assertCanConsume = (bytes: number, consume: boolean) => {
      if (!Number.isSafeInteger(bytes) || bytes < 0) {
        throw new FileError(HttpStatus.BAD_REQUEST, 'Invalid upload size')
      }

      const fileRemaining = this.maxFileSize - fileSize
      const quotaRemaining = this.quotaRemaining === undefined ? Number.POSITIVE_INFINITY : this.quotaRemaining - this.quotaConsumed

      if (bytes > fileRemaining || bytes > quotaRemaining) {
        // Report the first effective boundary. If both are equal, the file-size
        // limit is the more specific upload error.
        if (quotaRemaining < fileRemaining) {
          throw storageQuotaExceededError()
        }
        throw maxFileSizeExceededError()
      }

      if (consume) {
        fileSize += bytes
        this.quotaConsumed += bytes
      }
    }

    return {
      initialFileSize,
      assertKnownSize: (bytes) => assertCanConsume(bytes, false),
      assertFinalSize: (bytes) => {
        if (!Number.isSafeInteger(bytes) || bytes < fileSize) {
          throw new FileError(HttpStatus.BAD_REQUEST, 'Invalid upload size')
        }
        // Convert the declared final size into the number of bytes still expected on this stream.
        assertCanConsume(bytes - fileSize, false)
      },
      consume: (bytes) => assertCanConsume(bytes, true)
    }
  }
}

export function createUploadStreamLimiter(space: UploadQuotaSnapshot | undefined, maxFileSize: number): UploadStreamLimiter {
  // A null quota means unlimited storage; a negative remainder is clamped so every positive write is rejected.
  const quotaRemaining = space?.storageQuota == null ? undefined : Math.max(0, space.storageQuota - (space.storageUsage ?? 0))
  return new UploadStreamLimiter(maxFileSize, quotaRemaining)
}

export function parseContentLength(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined

  const normalized = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : ''
  if (!/^\d+$/.test(normalized)) {
    throw new FileError(HttpStatus.BAD_REQUEST, 'Invalid "content-length" header')
  }

  const contentLength = Number(normalized)
  if (!Number.isSafeInteger(contentLength)) {
    throw new FileError(HttpStatus.BAD_REQUEST, 'Invalid "content-length" header')
  }
  return contentLength
}

export function parseContentRange(value: string): { start: number; end: number; total?: number } {
  const match = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i.exec(value)
  if (!match) {
    throw new FileError(HttpStatus.BAD_REQUEST, 'Content-range : header is malformed')
  }
  const start = Number(match[1])
  const end = Number(match[2])
  const total = match[3] === '*' ? undefined : Number(match[3])
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    end < start ||
    (total !== undefined && (!Number.isSafeInteger(total) || total <= end))
  ) {
    throw new FileError(HttpStatus.BAD_REQUEST, 'Content-range : header is malformed')
  }
  return { start, end, ...(total !== undefined && { total }) }
}

export function isMultipartFileTooLargeError(e: any): boolean {
  // Other multipart limits also return 413; only this code means the file-size limit was reached.
  return e?.code === FASTIFY_MULTIPART_FILE_TOO_LARGE_CODE
}

export function uploadTmpFilePath(tmpPath: string, partFileName: string): string {
  return path.join(tmpPath, `${temporaryPathPrefix(partFileName, 'upload')}${randomUUID()}`)
}
