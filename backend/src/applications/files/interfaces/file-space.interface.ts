import type { File } from '../schemas/file.interface'

export class FileSpace implements Pick<File, 'id' | 'ownerId' | 'path' | 'isDir' | 'inTrash' | 'mime'> {
  id: number
  ownerId: number
  name: string
  path: string
  isDir: boolean
  inTrash: boolean
  mime: string
  // permissions are inherited from the shared file (space and root permissions are intersected)
  permissions?: string
  space: {
    alias: string
    name: string
    root: { alias: string; name: string }
  }
}
