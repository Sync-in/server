/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import type { SYNC_CLIENT_TYPE } from '../constants/sync'

export interface SyncClientInfo {
  node: string
  os: string
  osRelease: string
  user: string
  type: SYNC_CLIENT_TYPE
  version: string
}
