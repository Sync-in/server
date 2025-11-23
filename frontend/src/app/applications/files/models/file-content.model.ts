/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import type { FileContent } from '@sync-in-server/backend/src/applications/files/schemas/file-content.interface'
import { SPACE_ALIAS, SPACE_REPOSITORY } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import { SPACES_ICON } from '../../spaces/spaces.constants'
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
    const repository = this.path.split('/')[0]
    const isPersonal = this.path.split('/')[1] === SPACE_ALIAS.PERSONAL
    this.showedPath = this.path
      .split('/')
      .slice(isPersonal ? 2 : 1)
      .join('/')
    this.iconClass = repository === SPACE_REPOSITORY.SHARES ? 'purple' : 'primary'
    this.icon = repository === SPACE_REPOSITORY.SHARES ? SPACES_ICON.SHARES : isPersonal ? SPACES_ICON.PERSONAL : SPACES_ICON.SPACES
  }
}
