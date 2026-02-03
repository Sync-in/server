import { Column, SQL, sql } from 'drizzle-orm'
import { bigint, datetime, index, mysqlTable, text } from 'drizzle-orm/mysql-core'
import { files } from '../../files/schemas/files.schema'
import { users } from '../../users/schemas/users.schema'

/*
For now, comments are only allowed on existing files.
It is not possible to comment directly on this type of roots:
    * external share
    * external root space
It is however possible to comment on files included in these roots.
*/

export const comments = mysqlTable(
  'comments',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    userId: bigint('userId', { mode: 'number', unsigned: true })
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    fileId: bigint('fileId', { mode: 'number', unsigned: true })
      .references(() => files.id, { onDelete: 'cascade' })
      .notNull(),
    content: text(),
    modifiedAt: datetime('modifiedAt', { mode: 'date' }).default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
    createdAt: datetime('createdAt', { mode: 'date' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
  },
  (table) => [index('user_idx').on(table.userId), index('file_idx').on(table.fileId)]
)

// export const createFullTextContentIndex = sql`CREATE FULLTEXT INDEX `content_idx` ON comments (`content`)`

export const fileHasCommentsSubquerySQL = (fileId: Column | SQL): SQL =>
  sql`EXISTS(SELECT 1 FROM ${comments} WHERE ${sql`${fileId}`} IS NOT NULL AND ${sql`${comments.fileId}`} = ${sql`${fileId}`})`
