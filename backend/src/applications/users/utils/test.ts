/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { faker } from '@faker-js/faker'
import { SERVER_NAME } from '../../../common/shared'
import { USER_PERMISSION, USER_ROLE } from '../constants/user'
import type { UserModel } from '../models/user.model'

export function generateUserTest(withId: boolean = true): Partial<UserModel> {
  return {
    ...(withId && { id: -faker.number.int() }),
    login: faker.internet.username(),
    email: faker.internet.email(),
    firstName: SERVER_NAME,
    lastName: 'Testing',
    role: USER_ROLE.USER,
    isActive: true,
    password: 'password',
    applications: Object.values(USER_PERMISSION)
  }
}
