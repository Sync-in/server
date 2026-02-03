import { sql } from 'drizzle-orm'
import { bigint, boolean, date, datetime, index, int, mysqlTable, uniqueIndex, varchar } from 'drizzle-orm/mysql-core'
import { users } from '../../users/schemas/users.schema'

/*
   userId: must be a user with the role *3* (link)
*/

export const links = mysqlTable(
  'links',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    uuid: varchar('uuid', { length: 32 }).notNull(),
    userId: bigint('userId', { mode: 'number', unsigned: true })
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }),
    requireAuth: boolean('requireAuth').default(false).notNull(),
    nbAccess: int('nbAccess', { unsigned: true }).default(0).notNull(),
    limitAccess: int('limitAccess', { unsigned: true }).default(0).notNull(),
    expiresAt: date('expiresAt', { mode: 'date' }),
    createdAt: datetime('createdAt', { mode: 'date' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
  },
  (table) => [index('user_idx').on(table.userId), uniqueIndex('uuid_idx').on(table.uuid)]
)
