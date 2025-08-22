/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { SQL, sql } from 'drizzle-orm'
import { bigint, boolean, char, datetime, index, mysqlTable, tinyint, uniqueIndex, varchar } from 'drizzle-orm/mysql-core'

/*
  role:
    0: administrator
    1: user
    2: guest
    3: link
  notification:
    0: application
    1: application + mail
  onlineStatus:
    0: available
    1: busy
    2: absent
    3: offline
  storageQuota:
    0 : no storage
    null : unlimited
    other: limited to value
*/

export const users = mysqlTable(
  'users',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    login: varchar('login', { length: 255 }).notNull(),
    firstName: varchar('firstName', { length: 255 }),
    lastName: varchar('lastName', { length: 255 }),
    password: varchar('password', { length: 255 }).notNull(),
    passwordAttempts: tinyint('passwordAttempts', { unsigned: true }).default(0).notNull(),
    role: tinyint('role', { unsigned: true }).default(1).notNull(),
    isActive: boolean('isActive').default(true).notNull(),
    language: char('language', { length: 2 }),
    permissions: varchar('permissions', { length: 255 }).default('').notNull(),
    storageUsage: bigint('storageUsage', { mode: 'number', unsigned: true }).default(0),
    storageQuota: bigint('storageQuota', { mode: 'number', unsigned: true }),
    notification: tinyint('notification', { unsigned: true }).default(1).notNull(),
    onlineStatus: tinyint('onlineStatus', { unsigned: true }).default(0).notNull(),
    currentIp: varchar('currentIp', { length: 45 }),
    lastIp: varchar('lastIp', { length: 45 }),
    currentAccess: datetime('currentAccess', { mode: 'date' }),
    lastAccess: datetime('lastAccess', { mode: 'date' }),
    createdAt: datetime('createdAt', { mode: 'date' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
  },
  (table) => [uniqueIndex('email_idx').on(table.email), uniqueIndex('login_idx').on(table.login), index('role_idx').on(table.role)]
)

export const userFullNameSQL = (user: any): SQL<string> => sql`TRIM(CONCAT(${user.firstName}, ' ', ${user.lastName}))`
