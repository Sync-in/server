import { sql } from 'drizzle-orm'
import { AnyMySqlColumn, bigint, datetime, index, mysqlTable, tinyint, uniqueIndex, varchar } from 'drizzle-orm/mysql-core'

/*
  type:
    0: user
    1: custom (can be created by user)
  visibility:
    0: visible (default)
    1: private (non-members users cannot see this group - default for personal group type)
    2: isolated (hidden, its members cannot see it and cannot see each other)
  permissions: allows applications, only for user groups
*/

export const groups = mysqlTable(
  'groups',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    description: varchar('description', { length: 255 }),
    type: tinyint('type', { unsigned: true }).default(0).notNull(),
    visibility: tinyint('visibility', { unsigned: true }).default(0).notNull(),
    parentId: bigint('parentId', { mode: 'number', unsigned: true }).references((): AnyMySqlColumn => groups.id, { onDelete: 'set null' }),
    permissions: varchar('permissions', { length: 255 }).default('').notNull(),
    createdAt: datetime('createdAt', { mode: 'date' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    modifiedAt: datetime('modifiedAt', { mode: 'date' }).default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)
  },
  (table) => [
    uniqueIndex('name_idx').on(table.name),
    index('parent_idx').on(table.parentId),
    index('type_idx').on(table.type),
    index('visibility_idx').on(table.visibility)
  ]
)
