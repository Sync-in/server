/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { getAssetsMimeUrl, mimeDirectory, mimeDirectoryShare } from '../files/files.constants'
import type { ShareLinkModel } from '../links/models/share-link.model'
import { SPACES_PATH } from '../spaces/spaces.constants'
import type { ShareFileModel } from './models/share-file.model'
import type { ShareModel } from './models/share.model'

export function setMimeUrl(share: ShareModel | ShareFileModel | ShareLinkModel | any) {
  if (!share.file?.id) {
    share.mimeUrl = getAssetsMimeUrl(share.parent?.alias ? mimeDirectoryShare : mimeDirectory)
  } else {
    if (share.file.isDir) {
      share.file.mime = share.parent?.alias ? mimeDirectoryShare : mimeDirectory
    }
    share.mimeUrl = getAssetsMimeUrl(share.file.mime)
  }
}

export function getFilePath(share: ShareFileModel | ShareLinkModel) {
  let bPath: string
  const paths = share.file.path ? share.file.path.split('/').filter((p) => p && p !== '.') : []
  if (share.parent?.id) {
    if (!paths.length) {
      return [SPACES_PATH.SPACES_SHARES, share.parent.alias]
    }
    bPath = `${SPACES_PATH.SPACES_SHARES}/${share.parent.alias}`
    // if (share instanceof ShareFileModel && paths.length >= 2) {
    //   // remove the first element, it is replaced by the share itself
    //   paths.shift()
    // }
  } else if (share.file.space?.alias) {
    if (share.file.inTrash) {
      bPath = `${SPACES_PATH.SPACES_TRASH}/${share.file.space.alias}`
    } else {
      bPath = `${SPACES_PATH.SPACES_FILES}/${share.file.space.alias}`
      if (share.file.space?.root?.alias) {
        if (!paths.length) {
          paths.push(share.file.space.root.name)
        } else {
          bPath = `${bPath}/${share.file.space.root.alias}`
        }
      }
    }
  } else if (share.file?.ownerId) {
    bPath = `${share.file.inTrash ? SPACES_PATH.PERSONAL_TRASH : SPACES_PATH.PERSONAL_FILES}`
  } else {
    console.warn('unable to find the right file path', share)
  }
  const fileName = paths.pop()
  if (bPath && paths.length) {
    bPath = `${bPath}/${paths.join('/')}`
  }
  return [bPath, fileName]
}
