import type { FileProps } from '../../files/interfaces/file-props.interface'

export interface SpaceFiles {
  space: {
    alias: string
    name: string
  }
  files: FileProps[]
  hasRoots: boolean
  permissions: string
}
