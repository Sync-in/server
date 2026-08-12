import { LOCK_DEPTH } from '../../webdav/constants/webdav'

export interface SaveStreamTmpFileValidationContext {
  tmpPath: string
  realPath: string
  checksum?: string
}

export interface SaveStreamOptions {
  dav?: { depth: LOCK_DEPTH; lockTokens: string[] }
  checksumAlg?: string
  // Expected final file size, including any resumed range.
  expectedUploadSize?: number
  maxSize?: number
  tmpPath?: string
  validateTmpFile?: (ctx: SaveStreamTmpFileValidationContext) => Promise<void>
}
