import type { FileDBProps } from '../../files/interfaces/file-db-props.interface'
import type { FileProps } from '../../files/interfaces/file-props.interface'

export interface SpaceBrowseContext {
  dbFile: FileDBProps
  inPersonalSpace: boolean
  inSharesRepository: boolean
}

export type SpaceBrowseDetails = {
  syncs: boolean
  favorites: boolean
} | null

export interface SpaceFiles {
  space: {
    alias: string
    name: string
  }
  files: FileProps[]
  hasRoots: boolean
  permissions: string
}
