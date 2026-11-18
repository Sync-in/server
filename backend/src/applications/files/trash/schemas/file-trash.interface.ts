export interface FileTrash {
  id: number
  path: string
  isDir: boolean
  deletedAt?: Date
}

export interface FileTrashCleanupResult {
  deletedRecords: number
  errorRecords: number
}

export type FileTrashRecordMetadata = Pick<FileTrash, 'path' | 'isDir'>

export type FileTrashRecordMetadataMap = Map<FileTrash['id'], FileTrashRecordMetadata>
