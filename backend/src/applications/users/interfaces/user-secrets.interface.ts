/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { USER_SECRET } from '../constants/user'

export interface UserSecrets {
  [USER_SECRET.TWO_FA_SECRET]?: string
  [USER_SECRET.RECOVERY_CODES]?: string[]
  [USER_SECRET.WEBDAV_PASSWORD]?: string
}
