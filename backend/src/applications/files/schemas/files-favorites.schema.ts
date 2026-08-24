import { sql } from 'drizzle-orm'
import { bigint, datetime, index, mysqlTable, primaryKey } from 'drizzle-orm/mysql-core'
import { users } from '../../users/schemas/users.schema'
import { files } from './files.schema'

export const filesFavorites = mysqlTable(
  'files_favorites',
  {
    userId: bigint('userId', { mode: 'number', unsigned: true })
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    fileId: bigint('fileId', { mode: 'number', unsigned: true })
      .references(() => files.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: datetime('createdAt', { mode: 'date' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.fileId] }),
    index('file_idx').on(table.fileId),
    index('user_created_idx').on(table.userId, table.createdAt)
  ]
)
