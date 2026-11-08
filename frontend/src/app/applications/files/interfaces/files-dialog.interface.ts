export type FilesOverwriteAction = 'cancel' | 'skip' | 'overwrite'

export interface FileTreeEvent {
  id: number
  name: string
  path: string
  mime: string
  permissions?: string
}
