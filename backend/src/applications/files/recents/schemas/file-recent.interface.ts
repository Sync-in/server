export interface FileRecent {
  // Browser file identity: database id when available, otherwise negative inode.
  id: number
  ownerId?: number | null
  spaceId?: number | null
  shareId?: number | null
  path: string
  name: string
  mime: string
  mtime: number
  displayRootName?: string
}

export interface FileRecentLocation {
  ownerId?: number
  spaceId?: number
  shareId?: number | number[]
  path: string
}

export type FileRecentUpdate = Pick<FileRecent, 'id'> & Partial<Pick<FileRecent, 'name' | 'mime' | 'mtime'>>

export interface FileRecentDeletion {
  userId: number
  spaceId: number
  inPersonalSpace: boolean
  inSharesRepository: boolean
  path: string
}
