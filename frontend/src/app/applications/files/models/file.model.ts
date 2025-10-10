/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { ONLY_OFFICE_EXTENSIONS } from '@sync-in-server/backend/src/applications/files/constants/only-office'
import {
  API_FILES_OPERATION,
  API_FILES_OPERATION_THUMBNAIL,
  API_FILES_TASK_OPERATION
} from '@sync-in-server/backend/src/applications/files/constants/routes'
import type { FileProps } from '@sync-in-server/backend/src/applications/files/interfaces/file-props.interface'
import type { File } from '@sync-in-server/backend/src/applications/files/schemas/file.interface'
import { SPACE_OPERATION } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import { popFromObject } from '@sync-in-server/backend/src/common/shared'
import { convertBytesToText, getNewly } from '../../../common/utils/functions'
import { dJs } from '../../../common/utils/time'
import { CommentModel } from '../../comments/models/comment.model'
import { SPACES_PERMISSIONS_TEXT } from '../../spaces/spaces.constants'
import { setTextIconPermissions } from '../../spaces/spaces.functions'
import type { OwnerType } from '../../users/interfaces/owner.interface'
import { userAvatarUrl } from '../../users/user.functions'
import {
  compressibleMimes,
  defaultMimeUrl,
  getAssetsMimeUrl,
  mimeDirectory,
  mimeDirectoryShare,
  mimeFile,
  notViewableExtensions
} from '../files.constants'

export class FileModel implements File {
  id: number
  ownerId: number
  spaceId: number
  spaceExternalRootId: number
  shareExternalId: number
  path: string
  name: string
  isDir: boolean
  inTrash: boolean
  mime: string
  size: number
  mtime: number
  ctime: number

  // Extra properties
  hasComments: boolean
  root?: {
    id: number
    alias: string
    owner: OwnerType
    permissions: string
    hPerms: Partial<typeof SPACES_PERMISSIONS_TEXT>
    // only for shares
    enabled?: boolean
    description?: string
  }
  lock?: FileProps['lock']
  shares: { id: number; alias: string; name: string; type: number }[] = []
  links: { id: number; alias: string; name: string; type: number }[] = []
  spaces: { id: number; alias: string; name: string }[] = []
  syncs: { clientId: string; clientName: string; id: number }[] = []
  comments: CommentModel[]

  // Computed
  shortMime: string
  mimeUrl: string
  hSize: string
  hTimeAgo: string

  // States
  newly = 0
  isRenamed = false
  isImage = false
  isViewable = false
  isEditable = false
  isCompressible = true
  isBeingDeleted = false
  isSelected = false
  isDisabled = false
  canBeReShared = false
  haveThumbnail = false

  constructor(props: FileProps | File, basePath: string, inShare = false) {
    this.setShares(popFromObject('shares', props))
    Object.assign(this, props)
    this.path = `${basePath}/${this.path !== '.' ? `${this.path}/` : ''}${this.root?.alias || this.name}`
    this.mime = this.getMime(this.mime, inShare)
    this.hTimeAgo = dJs(this.mtime).fromNow(true)
    this.newly = getNewly(this.mtime)
    this.setMimeUrl()
    this.setHSize()
    this.setRoot(inShare)
  }

  get dataUrl(): string {
    return `${API_FILES_OPERATION}/${this.path}`
  }

  get taskUrl(): string {
    return `${API_FILES_TASK_OPERATION}/${this.path}`
  }

  get thumbnailUrl(): string {
    return `${API_FILES_OPERATION_THUMBNAIL}/${this.path}`
  }

  fallBackMimeUrl() {
    this.mimeUrl = defaultMimeUrl
  }

  rename(name: string) {
    this.name = name
    this.path = [...this.path.split('/').slice(0, -1), this.name].join('/')
  }

  private getType(inShare: boolean) {
    return this.isDir ? (inShare ? mimeDirectoryShare : mimeDirectory) : mimeFile
  }

  private getMime(mime: string, inShare: boolean) {
    if (this.isDir) {
      this.isViewable = false
      return this.getType(inShare)
    } else if (mime) {
      const mimeArray = mime.split('-')
      const longMime = mimeArray[mimeArray.length - 1]
      const extension = this.name.split('.').pop().toLowerCase()
      this.shortMime = mimeArray[0]
      if (extension === 'pdf') {
        // uses pdfjs for reading and onlyoffice for writing, this test should be placed first
        this.shortMime = longMime
        this.isViewable = true
        this.isEditable = ONLY_OFFICE_EXTENSIONS.EDITABLE.has(extension)
      } else if (ONLY_OFFICE_EXTENSIONS.EDITABLE.has(extension) || ONLY_OFFICE_EXTENSIONS.VIEWABLE.has(extension)) {
        this.shortMime = 'document'
        this.isEditable = ONLY_OFFICE_EXTENSIONS.EDITABLE.has(extension)
        this.isViewable = this.isEditable || ONLY_OFFICE_EXTENSIONS.VIEWABLE.has(extension)
      } else if (longMime === 'html') {
        this.isViewable = true
        this.isEditable = true
      } else if (extension === 'mp4') {
        this.isViewable = true
        this.shortMime = 'media'
        this.haveThumbnail = true
      } else if (this.shortMime === 'image') {
        this.isImage = true
        this.isViewable = true
        this.haveThumbnail = true
      } else if (['video', 'audio'].indexOf(this.shortMime) > -1) {
        this.shortMime = 'media'
        this.isViewable = true
        this.haveThumbnail = true
      } else if (compressibleMimes.has(mime)) {
        this.isCompressible = false
        this.isViewable = false
      } else if (!notViewableExtensions.has(extension)) {
        this.isViewable = true
        this.shortMime = 'text'
      }
      return mime
    } else {
      this.isViewable = true
      this.shortMime = 'text'
      return this.getType(inShare)
    }
  }

  private setMimeUrl() {
    this.mimeUrl = getAssetsMimeUrl(this.mime)
  }

  private setRoot(inShare: boolean) {
    if (this.root) {
      if (this.root.enabled === false) {
        this.isDisabled = true
      }
      this.root.hPerms = setTextIconPermissions(this.root.permissions, this.isDir ? [] : [SPACE_OPERATION.DELETE, SPACE_OPERATION.ADD])
      if (this.root?.owner?.login) {
        this.root.owner.avatarUrl = userAvatarUrl(this.root.owner.login)
      }
      this.canBeReShared = inShare && SPACE_OPERATION.SHARE_OUTSIDE in this.root.hPerms
    }
  }

  private setHSize() {
    this.hSize = this.isDir ? '●' : convertBytesToText(this.size, 0, true)
  }

  private setShares(shares: { id: number; alias: string; name: string; type: number }[]) {
    if (shares?.length) {
      for (const s of shares) {
        if (s.type === 0) {
          this.shares.push(s)
        } else {
          this.links.push(s)
        }
      }
    }
  }
}
