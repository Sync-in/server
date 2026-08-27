import type { LucideIcon } from '@lucide/angular'
import { FILE_REPOSITORY } from '@sync-in-server/backend/src/applications/files/constants/operations'
import { SPACE_REPOSITORY } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import { type FileLocationRepository, resolveFileLocation } from '../components/utils/file-location.utils'
import { defaultMimeUrl, getAssetsMimeUrl, mimeDirectory, mimeDirectoryShare } from '../files.constants'

interface FileLocationProps {
  id: number
  path: string
  name: string
  mime: string
  mtime: number
  isDir?: boolean
  inTrash?: boolean
  displayRootName?: string
}

export abstract class FileLocationModel {
  id: number
  path: string
  name: string
  mime: string
  mtime: number
  inTrash = false
  displayRootName?: string
  repository?: FileLocationRepository
  repositoryTitle?: string

  // Computed
  mimeUrl: string
  icon: LucideIcon
  iconClass: 'primary' | 'purple' = 'primary'
  showedPath: string

  protected constructor(props: Partial<FileLocationProps>, repository?: FileLocationRepository) {
    Object.assign(this, props)
    const location = resolveFileLocation(this.path, { repository, displayRootName: this.displayRootName })
    this.showedPath = location?.relativePath ?? this.path
    if (location) {
      this.repository = location.repository
      this.repositoryTitle = location.repositoryTitle
      this.iconClass = location.iconClass
      this.icon = location.icon
    } else {
      this.repository = repository
    }
    const displayMime = this.repository === FILE_REPOSITORY.SHARE && (props.isDir || this.mime === mimeDirectory) ? mimeDirectoryShare : this.mime
    this.mimeUrl = getAssetsMimeUrl(displayMime)
    this.inTrash = props.inTrash ?? this.path?.split('/')[0] === SPACE_REPOSITORY.TRASH
  }

  fallBackMimeUrl() {
    this.mimeUrl = defaultMimeUrl
  }
}
