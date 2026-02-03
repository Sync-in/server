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
}
