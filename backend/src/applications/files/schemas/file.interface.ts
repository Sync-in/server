import type { files } from './files.schema'

type FileSchema = typeof files.$inferSelect

export class File implements FileSchema {
  id: number
  ownerId: number
  spaceId: number
  spaceExternalRootId: number
  shareExternalId: number
  path: string
  name: string
  isDir: boolean
  inTrash: boolean
  mime: string
  size: number
  mtime: number
  ctime: number
}
