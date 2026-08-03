export interface FileContent {
  id: number
  path: string
  name: string
  mime: string
  size: number
  mtime: number
  // used for inserts
  content?: string
  // used for search
  matches?: string[]
  // used for search
  score?: number
  // used for search display
  displayRootName?: string
}

export type FileContentRecordMetadata = Pick<FileContent, 'name' | 'path' | 'size'>

export type FileContentRecordMetadataMap = Map<FileContent['id'], FileContentRecordMetadata>

export type FileContentMetadata = Omit<FileContent, 'content' | 'matches' | 'score'> & {
  realPath: string
  extension: string
}
