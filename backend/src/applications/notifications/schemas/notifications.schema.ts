import { sql } from 'drizzle-orm'
import { bigint, boolean, datetime, index, mysqlTable } from 'drizzle-orm/mysql-core'
import { jsonColumn } from '../../../infrastructure/database/columns'
import { users } from '../../users/schemas/users.schema'
import type { NotificationContent } from '../interfaces/notification-properties.interface'

export const notifications = mysqlTable(
  'notifications',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    fromUserId: bigint('fromUserId', { mode: 'number', unsigned: true }).references(() => users.id, { onDelete: 'cascade' }),
    toUserId: bigint('toUserId', { mode: 'number', unsigned: true })
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    content: jsonColumn<NotificationContent>()('content'),
    wasRead: boolean('wasRead').default(false).notNull(),
    createdAt: datetime('createdAt', { mode: 'date' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
  },
  (table) => [index('from_user_idx').on(table.fromUserId), index('to_user_idx').on(table.toUserId)]
)
