import { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { FILE_REPOSITORY } from '@sync-in-server/backend/src/applications/files/constants/operations'
import type { FileRecent } from '@sync-in-server/backend/src/applications/files/schemas/file-recent.interface'
import { SPACE_ALIAS, SPACE_REPOSITORY } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import { resolveFileLocation } from '../components/utils/file-location.utils'
import { defaultMimeUrl, getAssetsMimeUrl } from '../files.constants'

export class FileRecentModel implements FileRecent {
  id: number
  mime: string
  mtime: number
  name: string
  ownerId: number
  path: string
  shareId: number
  spaceId: number
  displayRootName?: string

  // Computed
  mimeUrl: string
  icon: IconDefinition
  iconClass: 'primary' | 'purple'
  showedPath: string
  inTrash = false

  constructor(props: Partial<FileRecent>) {
    Object.assign(this, props)
    this.mimeUrl = getAssetsMimeUrl(this.mime)
    const location = resolveFileLocation(this.path, {
      repository: this.shareId ? FILE_REPOSITORY.SHARE : this.spaceId ? FILE_REPOSITORY.SPACE : SPACE_ALIAS.PERSONAL,
      displayRootName: this.displayRootName
    })
    this.iconClass = location.iconClass
    this.icon = location.icon
    this.showedPath = location.relativePath
    this.inTrash = this.path.split('/')[0] === SPACE_REPOSITORY.TRASH
  }

  fallBackMimeUrl() {
    this.mimeUrl = defaultMimeUrl
  }
}
