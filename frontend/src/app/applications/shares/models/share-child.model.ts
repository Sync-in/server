/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { SHARE_TYPE } from '@sync-in-server/backend/src/applications/shares/constants/shares'
import type { ShareChild } from '@sync-in-server/backend/src/applications/shares/models/share-child.model'
import { defaultMimeUrl, getAssetsMimeUrl, mimeDirectory, mimeDirectoryShare } from '../../files/files.constants'
import type { OwnerType } from '../../users/interfaces/owner.interface'
import { userAvatarUrl } from '../../users/user.functions'

export class ShareChildModel implements ShareChild {
  id: number
  alias: string
  name: string
  file: { mime: string }
  parentId: number
  owner: OwnerType
  type: number

  // Extra properties
  isShareLink = false
  mimeUrl: string
  children: ShareChild[]

  constructor(props: ShareChild) {
    Object.assign(this, props)
    this.owner.avatarUrl = userAvatarUrl(this.owner.login)
    this.isShareLink = this.type === SHARE_TYPE.LINK
    this.setMimeUrl()
  }

  fallBackMimeUrl() {
    this.mimeUrl = defaultMimeUrl
  }

  private setMimeUrl() {
    if (!this.file || this.file.mime === mimeDirectory) {
      this.mimeUrl = getAssetsMimeUrl(mimeDirectoryShare)
    } else {
      this.mimeUrl = getAssetsMimeUrl(this.file.mime)
    }
  }
}
