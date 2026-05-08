import { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import type { FileFavorite } from '@sync-in-server/backend/src/applications/files/schemas/file-favorite.interface'
import { SPACE_ALIAS, SPACE_REPOSITORY } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import { SPACES_ICON } from '../../spaces/spaces.constants'
import { defaultMimeUrl, getAssetsMimeUrl } from '../../files/files.constants'

export class FileFavoriteModel implements FileFavorite {
  id: number
  name: string
  isDir: boolean
  mime: string
  size: number
  mtime: number
  ctime: number
  isFavorite: boolean
  navPath: string

  mimeUrl: string
  icon: IconDefinition
  iconClass: 'primary' | 'purple'
  showedPath: string

  constructor(props: FileFavorite) {
    Object.assign(this, props)
    this.mimeUrl = getAssetsMimeUrl(this.mime)
    const parts = this.navPath?.split('/') ?? []
    const repo = parts[0]   // 'files' or 'shares'
    const alias = parts[1]  // 'personal', space alias, or share alias
    if (repo === SPACE_REPOSITORY.SHARES) {
      this.icon = SPACES_ICON.SHARES
      this.iconClass = 'purple'
    } else if (alias === SPACE_ALIAS.PERSONAL) {
      this.icon = SPACES_ICON.PERSONAL
      this.iconClass = 'primary'
    } else {
      this.icon = SPACES_ICON.SPACES
      this.iconClass = 'purple'
    }
    this.showedPath = parts.slice(2).join('/') || alias || ''
  }

  fallBackMimeUrl() {
    this.mimeUrl = defaultMimeUrl
  }
}
