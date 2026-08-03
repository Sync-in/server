import { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import type { FileContent } from '@sync-in-server/backend/src/applications/files/schemas/file-content.interface'
import { resolveFileLocation } from '../file-location.utils'
import { defaultMimeUrl, getAssetsMimeUrl } from '../files.constants'

export class FileContentModel implements FileContent {
  id: number
  path: string
  name: string
  mime: string
  size: number
  mtime: number
  matches: string[]

  // Computed
  mimeUrl: string
  icon: IconDefinition
  iconClass: 'primary' | 'purple'
  showedPath: string

  constructor(props: FileContent) {
    Object.assign(this, props)
    this.mimeUrl = getAssetsMimeUrl(this.mime)
    this.setProperties()
  }

  fallBackMimeUrl() {
    this.mimeUrl = defaultMimeUrl
  }

  private setProperties() {
    const location = resolveFileLocation(this.path)
    if (!location) return
    this.showedPath = location.relativePath
    this.iconClass = location.iconClass
    this.icon = location.icon
  }
}
