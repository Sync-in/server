import { FileError } from '../models/file-error'
import { HttpStatus } from '@nestjs/common'

export const FILE_ERROR_MESSAGES = {
  DOWNLOAD_PRIVATE_IP: 'Access to internal IP addresses is forbidden',
  DOWNLOAD_INVALID_CONTENT_LENGTH: 'Missing or invalid "content-length" header',
  DOWNLOAD_MAX_REDIRECTS_EXCEEDED: 'Maximum redirects exceeded',
  DOWNLOAD_MISSING_REDIRECT_LOCATION: 'Missing redirect location',
  DOWNLOAD_UNSAFE_REDIRECT_LOCATION: 'Unsafe redirect location',
  MAX_FILE_SIZE_EXCEEDED: 'File size limit exceeded',
  STORAGE_QUOTA_EXCEEDED: 'Storage quota will be exceeded'
} as const

export function maxFileSizeExceededError(): FileError {
  return new FileError(HttpStatus.PAYLOAD_TOO_LARGE, FILE_ERROR_MESSAGES.MAX_FILE_SIZE_EXCEEDED)
}
