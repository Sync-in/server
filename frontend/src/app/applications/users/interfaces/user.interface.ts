/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import type { UserModel } from '@sync-in-server/backend/src/applications/users/models/user.model'

export type UserType = Omit<UserModel, 'permissions' | 'password'>

export type UserStatus = keyof Pick<UserType, 'isAdmin' | 'isUser' | 'isGuest' | 'isLink' | 'clientId'>
