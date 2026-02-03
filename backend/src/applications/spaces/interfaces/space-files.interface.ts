import type { FileProps } from '../../files/interfaces/file-props.interface'

export interface SpaceFiles {
  files: FileProps[]
  hasRoots: boolean
  permissions: string
}
