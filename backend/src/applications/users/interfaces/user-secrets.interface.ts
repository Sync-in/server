/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { AUTH_SCOPE } from '../../../authentication/constants/scope'
import { USER_SECRET } from '../constants/user'

export interface UserAppPassword {
  name: string
  app: AUTH_SCOPE
  password: string
  expiration: Date
  currentIp: string
  lastIp: string
  currentAccess: Date
  lastAccess: Date
  createdAt: Date
}

export interface UserSecrets {
  [USER_SECRET.TWO_FA_SECRET]?: string
  [USER_SECRET.RECOVERY_CODES]?: string[]
  [USER_SECRET.APP_PASSWORDS]?: UserAppPassword[]
}
