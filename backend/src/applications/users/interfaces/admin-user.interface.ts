/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import type { User } from '../schemas/user.interface'
import type { Member } from './member.interface'

export type AdminUser = Partial<User> & { fullName: string; groups?: Member[]; twoFaEnabled?: boolean }
