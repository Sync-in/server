import { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import type { FileRecent } from '@sync-in-server/backend/src/applications/files/schemas/file-recent.interface'
import { SPACE_ALIAS, SPACE_REPOSITORY } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import { SPACES_ICON } from '../../spaces/spaces.constants'
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

  // Computed
  mimeUrl: string
  icon: IconDefinition
  iconClass: 'primary' | 'purple'
  showedPath: string
  inTrash = false

  constructor(props: Partial<FileRecent>) {
    Object.assign(this, props)
    this.mimeUrl = getAssetsMimeUrl(this.mime)
    this.iconClass = this.shareId ? 'purple' : 'primary'
    this.icon = this.shareId ? SPACES_ICON.SHARES : this.spaceId ? SPACES_ICON.SPACES : SPACES_ICON.PERSONAL
    this.showedPath = this.path
      .split('/')
      .slice(this.path.split('/')[1] === SPACE_ALIAS.PERSONAL ? 2 : 1)
      .join('/')
    this.inTrash = this.path.split('/')[0] === SPACE_REPOSITORY.TRASH
  }

  fallBackMimeUrl() {
    this.mimeUrl = defaultMimeUrl
  }
}
