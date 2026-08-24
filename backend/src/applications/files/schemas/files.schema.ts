import { SQL, sql, SQLWrapper } from 'drizzle-orm'
import { AnyMySqlColumn, bigint, boolean, index, mysqlTable, varchar } from 'drizzle-orm/mysql-core'
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

// Supports path = '.' and removes one leading './' without invoking the regex engine.
// CHAR_LENGTH keeps the exact-dot case safe with PAD SPACE collations.
export const filePathSQL = (file: any): SQL<string> => sql`
  IF (
    CHAR_LENGTH(${file.path}) = 1 AND ${file.path} = '.',
    ${file.name},
    CONCAT(
      IF (LEFT(${file.path}, 2) = './', SUBSTRING(${file.path}, 3), ${file.path}),
      '/',
      ${file.name}
    )
  )
`

// Appending '/' handles both an exact path and its descendants while keeping trailing spaces significant with PAD SPACE collations.
export const childPathMatch = (pathSQL: SQLWrapper, path: string): SQL<string> =>
  sql`LEFT(CONCAT(${pathSQL}, '/'), CHAR_LENGTH(${path}) + 1) = CONCAT(${path}, '/')`

// Applies the literal path-boundary match to the path stored on file records.
export const childFilesMatch = (path: string): SQL<string> => childPathMatch(files.path, path)

// Replaces a previously matched source prefix while preserving the remaining child-path suffix.
export const childFilesReplacePath = (srcPath: string, dstPath: string): SQL<string> =>
  sql`CONCAT(${dstPath}, SUBSTRING(${files.path}, CHAR_LENGTH(${srcPath}) + 1))`
