export interface TemporaryDirectory {
  // Also considers entries without the managed temporary-file prefix during cleanup.
  includeUnmanagedEntries: boolean
  path: string
}

export interface TemporaryDirectorySnapshot {
  fileNames: string[]
  path: string
}

export type TemporaryDirectoriesByUser = Map<number, Map<string, TemporaryDirectory>>
