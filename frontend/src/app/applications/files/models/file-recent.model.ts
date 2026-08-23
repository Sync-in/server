import { FILE_REPOSITORY } from '@sync-in-server/backend/src/applications/files/constants/operations'
import type { FileRecent } from '@sync-in-server/backend/src/applications/files/schemas/file-recent.interface'
import { SPACE_ALIAS } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import { FileLocationModel } from './file-location.model'

export class FileRecentModel extends FileLocationModel implements FileRecent {
  ownerId: number
  shareId: number
  spaceId: number

  constructor(props: Partial<FileRecent>) {
    super(props, props.shareId ? FILE_REPOSITORY.SHARE : props.spaceId ? FILE_REPOSITORY.SPACE : SPACE_ALIAS.PERSONAL)
  }
}
