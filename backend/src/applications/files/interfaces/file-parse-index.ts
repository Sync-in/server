export type FileParseType = 'user' | 'space' | 'share'

export interface FileParseContext {
  realPath: string
  pathPrefix: string
  isDir: boolean
}

export interface FileIndexContext {
  indexSuffix: string
  pathPrefix: string
  regexBasePath: RegExp
  db: Map<number, { name: string; path: string; size: number }>
  fs: Set<number>
}
