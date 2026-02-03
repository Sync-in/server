import { sql } from 'drizzle-orm'
import { bigint, datetime, index, mysqlTable, tinyint, unique, varchar } from 'drizzle-orm/mysql-core'
import { links } from '../../links/schemas/links.schema'
import { groups } from '../../users/schemas/groups.schema'
import { users } from '../../users/schemas/users.schema'
import { spaces } from './spaces.schema'

/*
  role:
    0: is member
    1: is manager
*/

export const spacesMembers = mysqlTable(
  'spaces_members',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    spaceId: bigint('spaceId', { mode: 'number', unsigned: true })
      .references(() => spaces.id, { onDelete: 'cascade' })
      .notNull(),
    userId: bigint('userId', { mode: 'number', unsigned: true }).references(() => users.id, { onDelete: 'cascade' }),
    groupId: bigint('groupId', { mode: 'number', unsigned: true }).references(() => groups.id, { onDelete: 'cascade' }),
    linkId: bigint('linkId', { mode: 'number', unsigned: true }).references(() => links.id, { onDelete: 'cascade' }),
    role: tinyint('role', { unsigned: true }).default(0).notNull(),
    permissions: varchar('permissions', { length: 32 }).default(''),
    createdAt: datetime('createdAt', { mode: 'date' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    modifiedAt: datetime('modifiedAt', { mode: 'date' }).default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)
  },
  (table) => [
    unique('space_user_uniq').on(table.spaceId, table.userId),
    unique('space_group_uniq').on(table.spaceId, table.groupId),
    unique('space_link_uniq').on(table.spaceId, table.linkId),
    index('space_idx').on(table.spaceId),
    index('user_idx').on(table.userId),
    index('group_idx').on(table.groupId),
    index('link_idx').on(table.linkId),
    index('role_idx').on(table.role)
  ]
)
