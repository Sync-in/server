import type { SpaceEnv } from '../../spaces/models/space-env.model'

export interface DownloadFileContentInfo {
  contentLength: number | null
  contentType: string
  lastModified: string | undefined
}

export interface DownloadFileOptions {
  allowPrivateIP?: boolean
  space?: SpaceEnv
  publishedPath?: string
  getContentInfo?: boolean
  maxSize?: number
  signal?: AbortSignal
}
