import { LOCK_DEPTH } from '../../webdav/constants/webdav'

export interface SaveStreamTmpFileValidationContext {
  tmpPath: string
  realPath: string
  checksum?: string
}

export interface SaveStreamOptions {
  dav?: { depth: LOCK_DEPTH; lockTokens: string[] }
  checksumAlg?: string
  tmpPath?: string
  validateTmpFile?: (ctx: SaveStreamTmpFileValidationContext) => Promise<void>
}
