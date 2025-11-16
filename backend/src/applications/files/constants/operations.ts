/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

export enum FILE_OPERATION {
  MAKE = 'make',
  COPY = 'copy',
  MOVE = 'move',
  DELETE = 'delete',
  COMPRESS = 'compress',
  DECOMPRESS = 'decompress',
  DOWNLOAD = 'download',
  UPLOAD = 'upload',
  TOUCH = 'touch',
  THUMBNAIL = 'thumbnail',
  LOCK = 'lock',
  UNLOCK = 'unlock',
  UNLOCK_REQUEST = 'unlock-request'
}

export enum FILE_MODE {
  VIEW = 'view',
  EDIT = 'edit'
}
