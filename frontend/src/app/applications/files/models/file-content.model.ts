import type { FileContent } from '@sync-in-server/backend/src/applications/files/schemas/file-content.interface'
import { FileLocationModel } from './file-location.model'

export class FileContentModel extends FileLocationModel implements FileContent {
  size: number
  matches: string[]

  constructor(props: FileContent) {
    super(props)
  }
}
