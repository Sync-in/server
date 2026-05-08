import type { FILE_REPOSITORY } from '../constants/operations'

export interface FileParseContext {
  realPath: string
  pathPrefix: string
  isDir: boolean
}

export interface FileParseContentPath {
  id: number
  type: FILE_REPOSITORY
  paths: FileParseContext[]
}

export interface FileContentIndexContext {
  indexName: string
  pathPrefix: string
  regexBasePath?: RegExp
}

export interface FileParseTrashRetentionPath {
  id: number
  type: FILE_REPOSITORY
  realPath: string
}

export interface FileTrashRetentionIndexContext {
  tableName: string
  regexBasePath: RegExp
}
