/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import type { FileSpace } from '@sync-in-server/backend/src/applications/files/interfaces/file-space.interface'
import type { LinkGuest } from '@sync-in-server/backend/src/applications/links/interfaces/link-guest.interface'
import type { ShareLink } from '@sync-in-server/backend/src/applications/shares/interfaces/share-link.interface'
import { getNewly } from '../../../common/utils/functions'
import { dJs } from '../../../common/utils/time'
import { defaultMimeUrl } from '../../files/files.constants'
import { setMimeUrl } from '../../shares/shares.functions'
import { SPACES_PERMISSIONS_TEXT } from '../../spaces/spaces.constants'
import { setTextIconPermissions } from '../../spaces/spaces.functions'

export class ShareLinkModel implements ShareLink {
  id: number
  ownerId: number
  name: string
  alias: string
  externalPath: string
  parent: ShareLink['parent']
  file: FileSpace
  link: LinkGuest

  // Compatibility with ShareModel
  description: string

  // Computed
  mimeUrl: string
  hTimeExpirationAgo = 0
  hTimeAccessAgo: string
  hPerms: Partial<typeof SPACES_PERMISSIONS_TEXT> = {}
  // States
  newly = 0

  constructor(props: Partial<ShareLinkModel>) {
    Object.assign(this, props)
    setMimeUrl(this)
    this.updatePermission()
    this.updateTimes()
  }

  fallBackMimeUrl() {
    this.mimeUrl = defaultMimeUrl
  }

  updatePermission() {
    this.hPerms = setTextIconPermissions(this.link.permissions)
  }

  updateTimes() {
    this.hTimeAccessAgo = dJs(this.link.currentAccess).fromNow(true)
    this.newly = getNewly(this.link.currentAccess)
    if (this.link.expiresAt) {
      this.link.expiresAt = new Date(dJs(this.link.expiresAt).local().format('YYYY-MM-DD'))
      const diff = Math.max(0, dJs(this.link.expiresAt).diff(dJs(), 'hours'))
      if (diff === 0) {
        this.hTimeExpirationAgo = 0
      } else if (diff <= 24) {
        this.hTimeExpirationAgo = 1
      } else {
        this.hTimeExpirationAgo = Math.round(diff / 24) + 1
      }
    } else {
      this.hTimeExpirationAgo = 0
    }
  }
}
