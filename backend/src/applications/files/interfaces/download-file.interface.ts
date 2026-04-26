import type { SpaceEnv } from '../../spaces/models/space-env.model'

export interface DownloadFileContentInfo {
  contentLength: number | null
  contentType: string
  lastModified: string | undefined
}

export interface DownloadFileOptions {
  space?: SpaceEnv
  getContentInfo?: boolean
}
