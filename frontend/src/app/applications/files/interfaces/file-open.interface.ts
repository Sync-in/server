import type { FileModel } from '../models/file.model'

export interface FileOpenOptions {
  expectedShortMime?: NonNullable<FileModel['shortMime']>
  fragment?: string
  photopea?: boolean
}

export interface ResolvedFile {
  file: FileModel
  permissions: string
}
