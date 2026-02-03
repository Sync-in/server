import { sql } from 'drizzle-orm'
import { bigint, datetime, index, mysqlTable, unique, varchar } from 'drizzle-orm/mysql-core'
import { links } from '../../links/schemas/links.schema'
import { groups } from '../../users/schemas/groups.schema'
import { users } from '../../users/schemas/users.schema'
import { shares } from './shares.schema'

/*
  linkId: userId is required
*/

export const sharesMembers = mysqlTable(
  'shares_members',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    shareId: bigint('shareId', { mode: 'number', unsigned: true })
      .references(() => shares.id, { onDelete: 'cascade' })
      .notNull(),
    userId: bigint('userId', { mode: 'number', unsigned: true }).references(() => users.id, { onDelete: 'cascade' }),
    groupId: bigint('groupId', { mode: 'number', unsigned: true }).references(() => groups.id, { onDelete: 'cascade' }),
    linkId: bigint('linkId', { mode: 'number', unsigned: true }).references(() => links.id, { onDelete: 'cascade' }),
    permissions: varchar('permissions', { length: 32 }).default(''),
    createdAt: datetime('createdAt', { mode: 'date' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    modifiedAt: datetime('modifiedAt', { mode: 'date' }).default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)
  },
  (table) => [
    unique('share_user_uniq').on(table.shareId, table.userId),
    unique('share_group_uniq').on(table.shareId, table.groupId),
    unique('share_link_uniq').on(table.shareId, table.linkId),
    index('share_idx').on(table.shareId),
    index('user_idx').on(table.userId),
    index('group_idx').on(table.groupId),
    index('link_idx').on(table.linkId)
  ]
)
