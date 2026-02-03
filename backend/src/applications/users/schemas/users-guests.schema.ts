import { sql } from 'drizzle-orm'
import { bigint, check, datetime, index, mysqlTable, primaryKey } from 'drizzle-orm/mysql-core'
import { users } from './users.schema'

export const usersGuests = mysqlTable(
  'users_guests',
  {
    userId: bigint('userId', { mode: 'number', unsigned: true })
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    guestId: bigint('guestId', { mode: 'number', unsigned: true })
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: datetime('createdAt', { mode: 'date' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.guestId] }),
    index('user_idx').on(table.userId),
    index('guest_id').on(table.guestId),
    check('user_guest_check', sql`${table.userId} <> ${table.guestId}`)
  ]
)
