import { filesRecents } from './files-recents.schema'

type FileRecentSchema = typeof filesRecents.$inferSelect

export class FileRecent implements FileRecentSchema {
  // Browser file identity: database id when available, otherwise negative inode.
  id: number
  ownerId: number
  spaceId: number
  shareId: number
  path: string
  name: string
  mime: string
  mtime: number
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
