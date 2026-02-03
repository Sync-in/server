import { SQL, sql } from 'drizzle-orm'
import { AnyMySqlColumn, bigint, boolean, index, mysqlTable, varchar } from 'drizzle-orm/mysql-core'
import { escapeSQLRegexp } from '../../../common/functions'
import { shares } from '../../shares/schemas/shares.schema'
import { spacesRoots } from '../../spaces/schemas/spaces-roots.schema'
import { spaces } from '../../spaces/schemas/spaces.schema'
import { users } from '../../users/schemas/users.schema'

/*
  ownerId: defined if the file is in a personal space (spaceId & spaceExternalRootId & shareExternalId must be null)
  spaceId: defined if the file is in a space (ownerId & spaceExternalRootId & shareExternalId must be null)
  spaceExternalRootId: defined if the file is in space root with an external path (spaceId required)
  shareExternalId: defined for a share created with an external path (spaceId & spaceRootId must be null)
*/

export const files = mysqlTable(
  'files',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    ownerId: bigint('ownerId', { mode: 'number', unsigned: true }).references(() => users.id, { onDelete: 'cascade' }),
    spaceId: bigint('spaceId', { mode: 'number', unsigned: true }).references(() => spaces.id, { onDelete: 'cascade' }),
    spaceExternalRootId: bigint('spaceExternalRootId', {
      mode: 'number',
      unsigned: true
    }).references((): AnyMySqlColumn => spacesRoots.id, { onDelete: 'cascade' }),
    shareExternalId: bigint('shareExternalId', { mode: 'number', unsigned: true }).references(() => shares.id, { onDelete: 'cascade' }),
    path: varchar('path', { length: 4096 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    isDir: boolean('isDir').notNull(),
    inTrash: boolean('inTrash').default(false).notNull(),
    mime: varchar('mime', { length: 255 }),
    size: bigint('size', { mode: 'number', unsigned: true }).default(0),
    mtime: bigint('mtime', { mode: 'number', unsigned: true }).default(0),
    ctime: bigint('ctime', { mode: 'number', unsigned: true }).default(0)
  },
  (table) => [
    index('owner_idx').on(table.ownerId),
    index('space_idx').on(table.spaceId),
    index('space_external_root_idx').on(table.spaceExternalRootId),
    index('share_external_idx').on(table.shareExternalId),
    index('name_idx').on(table.name),
    index('path_idx').on(table.path)
  ]
)

// supports the case where path = '.' or './sync-in' and removes '.' or './' if exists
export const filePathSQL = (file: any): SQL<string> => sql`REGEXP_REPLACE(CONCAT(${file.path}, '/', ${file.name}), '^(\\\\.\\\\/){0,1}(.*)', '\\\\2')`

export const childFilesFindRegexp = (path: string): SQL<string> => sql`${files.path}${sql.raw(`REGEXP '^${escapeSQLRegexp(path)}(/|$)'`)}`

export const childFilesReplaceRegexp = (srcPath: string, dstPath: string): SQL<string> =>
  sql`REGEXP_REPLACE(${files.path}, '^${sql.raw(escapeSQLRegexp(srcPath))}', '${sql.raw(escapeSQLRegexp(dstPath))}')`
