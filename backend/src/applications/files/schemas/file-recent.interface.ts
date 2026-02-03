import { filesRecents } from './files-recents.schema'

type FileRecentSchema = typeof filesRecents.$inferSelect

export class FileRecent implements FileRecentSchema {
  id: number
  ownerId: number
  spaceId: number
  shareId: number
  path: string
  name: string
  mime: string
  mtime: number
}
