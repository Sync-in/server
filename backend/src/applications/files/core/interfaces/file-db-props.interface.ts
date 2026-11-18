import type { File } from '../schemas/file.interface.js'

export interface FileDBProps extends Partial<Pick<File, 'ownerId' | 'spaceId' | 'spaceExternalRootId' | 'shareExternalId' | 'inTrash' | 'path'>> {
  // warn: used during lock creation, new fields will be used in the lock key
  ownerId?: number | null
  spaceId?: number | null
  spaceExternalRootId?: number | null
  shareExternalId?: number | null
  inTrash: boolean
  // full path with name
  path: string
}
