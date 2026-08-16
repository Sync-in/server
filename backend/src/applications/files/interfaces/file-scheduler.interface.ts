export interface TemporaryDirectory {
  includeLegacyEntries: boolean
  path: string
}

export interface TemporaryDirectorySnapshot {
  fileNames: string[]
  path: string
}

export type TemporaryDirectoriesByUser = Map<number, Map<string, TemporaryDirectory>>
