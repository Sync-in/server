import { sql } from 'drizzle-orm'
import { bigint, datetime, index, mysqlTable, primaryKey, tinyint } from 'drizzle-orm/mysql-core'
import { groups } from './groups.schema'
import { users } from './users.schema'

/*
  role:
    0: is member
    1: is manager (this allows the user to edit personal groups but not create or delete them)
*/

export const usersGroups = mysqlTable(
  'users_groups',
  {
    userId: bigint('userId', { mode: 'number', unsigned: true })
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    groupId: bigint('groupId', { mode: 'number', unsigned: true })
      .references(() => groups.id, { onDelete: 'cascade' })
      .notNull(),
    role: tinyint('role', { unsigned: true }).default(0).notNull(),
    createdAt: datetime('createdAt', { mode: 'date' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
  },
  (table) => [primaryKey({ columns: [table.userId, table.groupId] }), index('user_idx').on(table.userId), index('group_idx').on(table.groupId)]
)
