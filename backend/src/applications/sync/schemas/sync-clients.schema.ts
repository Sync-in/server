/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { sql } from 'drizzle-orm'
import { bigint, boolean, char, datetime, index, json, mysqlTable, varchar } from 'drizzle-orm/mysql-core'
import { users } from '../../users/schemas/users.schema'
import type { SyncClientInfo } from '../interfaces/sync-client.interface'

export const syncClients = mysqlTable(
  'sync_clients',
  {
    id: char('id', { length: 36 }).primaryKey(),
    ownerId: bigint('ownerId', { mode: 'number', unsigned: true })
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    token: char('token', { length: 36 }).notNull(),
    tokenExpiration: bigint('tokenExpiration', { mode: 'number', unsigned: true }).notNull(),
    info: json('info').$type<SyncClientInfo>().notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    currentIp: varchar('currentIp', { length: 45 }),
    lastIp: varchar('lastIp', { length: 45 }),
    currentAccess: datetime('currentAccess', { mode: 'date' }),
    lastAccess: datetime('lastAccess', { mode: 'date' }),
    createdAt: datetime('createdAt', { mode: 'date' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
  },
  (table) => [index('owner_idx').on(table.ownerId), index('token_idx').on(table.token)]
)
