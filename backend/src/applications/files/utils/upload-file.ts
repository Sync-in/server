import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileName } from './files'

const FASTIFY_MULTIPART_FILE_TOO_LARGE_CODE = 'FST_REQ_FILE_TOO_LARGE' as const

export function isMultipartFileTooLargeError(e: any): boolean {
  // Other multipart limits also return 413; only this code means the file-size limit was reached.
  return e?.code === FASTIFY_MULTIPART_FILE_TOO_LARGE_CODE
}

export function uploadTmpFilePath(tmpPath: string, partFileName: string): string {
  return path.join(tmpPath, `${randomUUID()}-upload-${fileName(partFileName) || 'file'}`)
}
