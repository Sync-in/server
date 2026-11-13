import type { FileDBProps } from '../../files/interfaces/file-db-props.interface.js'
import type { FileProps } from '../../files/interfaces/file-props.interface.js'

export interface SpaceBrowserRootFile {
  file: FileProps
  // Internal lock target; `SpacesBrowser` only returns `file` to API consumers.
  dbFile: FileDBProps | null
}
