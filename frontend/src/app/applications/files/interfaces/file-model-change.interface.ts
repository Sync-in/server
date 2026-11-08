import type { FileModel } from '../models/file.model'

export type FileModelChangeKind = 'comments' | 'favorite' | 'lock' | 'size'

export interface FileModelChange {
  file: FileModel
  kind: FileModelChangeKind
}
