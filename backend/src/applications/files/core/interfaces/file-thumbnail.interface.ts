import type { Readable } from 'node:stream'

export interface FileThumbnail {
  mimeType: string
  size: number
  stream: Readable
}
