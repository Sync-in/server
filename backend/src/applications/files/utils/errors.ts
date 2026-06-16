import { FileError } from '../models/file-error'
import { HttpStatus } from '@nestjs/common'
import { FILE_ERROR } from '../constants/errors'

export function maxFileSizeExceededError(): FileError {
  return new FileError(HttpStatus.PAYLOAD_TOO_LARGE, FILE_ERROR.MAX_FILE_SIZE_EXCEEDED)
}

export function storageQuotaExceededError(): FileError {
  return new FileError(HttpStatus.INSUFFICIENT_STORAGE, FILE_ERROR.STORAGE_QUOTA_EXCEEDED)
}
