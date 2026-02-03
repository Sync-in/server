import type { File } from '../schemas/file.interface'

export interface FileDBProps extends Partial<Pick<File, 'ownerId' | 'spaceId' | 'spaceExternalRootId' | 'shareExternalId' | 'inTrash' | 'path'>> {
  // warn: used during lock creation, new fields will be used in the lock key
  ownerId?: number
  spaceId?: number
  spaceExternalRootId?: number
  shareExternalId?: number
  inTrash: boolean
  // full path with name
  path: string
}
