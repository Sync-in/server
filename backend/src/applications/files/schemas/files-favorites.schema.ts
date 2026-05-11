import { Column, SQL, sql } from 'drizzle-orm'
import { bigint, datetime, index, mysqlTable, primaryKey } from 'drizzle-orm/mysql-core'
import { files } from './files.schema'
import { users } from '../../users/schemas/users.schema'

export const filesFavorites = mysqlTable(
  'files_favorites',
  {
    userId: bigint('userId', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fileId: bigint('fileId', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    createdAt: datetime('createdAt', { mode: 'date' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.fileId] }),
    index('files_favorites_user_idx').on(table.userId),
    index('files_favorites_file_idx').on(table.fileId)
  ]
)

export const fileIsFavoriteForUserSQL = (fileId: Column | SQL, userId: Column | SQL): SQL =>
  sql`EXISTS(SELECT 1 FROM ${filesFavorites} WHERE ${filesFavorites.fileId} = ${fileId} AND ${filesFavorites.userId} = ${userId})`
