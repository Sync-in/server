import { sql } from 'drizzle-orm'
import { bigint, datetime, index, mysqlTable, unique, varchar } from 'drizzle-orm/mysql-core'
import { files } from '../../files/schemas/files.schema'
import { spaces } from './spaces.schema'

/*
  alias: used to navigate over web & webdav, must be unique for each space
  name: set by user and showed on web only
  ownerId: the root owner (and the file owner)
  fileId: from the owner files
  externalPath: is defined if we need to access a path outside of spaces, only administrators can add this kind of root
  fileId or externalPath must be defined
*/

export const spacesRoots = mysqlTable(
  'spaces_roots',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    spaceId: bigint('spaceId', { mode: 'number', unsigned: true })
      .references(() => spaces.id, { onDelete: 'cascade' })
      .notNull(),
    fileId: bigint('fileId', { mode: 'number', unsigned: true }).references(() => files.id, { onDelete: 'cascade' }),
    alias: varchar('alias', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    externalPath: varchar('externalPath', { length: 4096 }),
    permissions: varchar('permissions', { length: 32 }).default(''),
    createdAt: datetime('createdAt', { mode: 'date' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    modifiedAt: datetime('modifiedAt', { mode: 'date' }).default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)
  },
  (table) => [
    unique('space_root_alias_uniq').on(table.id, table.alias),
    index('alias_idx').on(table.alias),
    index('space_idx').on(table.spaceId),
    index('file_idx').on(table.fileId)
  ]
)
