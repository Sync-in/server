/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import type { UserModel } from '../../applications/users/models/user.model'
import type { AUTH_SCOPE } from '../constants/scope'

export abstract class AuthMethod {
  abstract validateUser(loginOrEmail: string, password: string, ip?: string, scope?: AUTH_SCOPE): Promise<UserModel>
}
