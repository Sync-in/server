import type { FileDBProps } from '../../files/core/interfaces/file-db-props.interface.js'
import type { FileProps } from '../../files/core/interfaces/file-props.interface.js'

export interface SpaceBrowserRootFile {
  file: FileProps
  // Internal lock target; `SpacesBrowser` only returns `file` to API consumers.
  dbFile: FileDBProps | null
}
