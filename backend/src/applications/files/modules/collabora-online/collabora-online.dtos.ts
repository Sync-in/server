/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import type { FILE_MODE } from '../../constants/operations'
import type { FileLockProps } from '../../interfaces/file-props.interface'

export interface CollaboraOnlineReqDto {
  documentServerUrl: string
  mode: FILE_MODE
  hasLock: false | FileLockProps
}

export interface CollaboraSaveDocumentDto {
  LastModifiedTime: string
}
