export interface TemporaryDirectorySnapshot {
  fileNames: string[]
  path: string
}

export type TemporaryDirectoriesByUser = Map<number, Map<string, TemporaryDirectorySnapshot>>
