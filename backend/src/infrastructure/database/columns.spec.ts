import { mysqlTable } from 'drizzle-orm/mysql-core'
import { filesRecents } from '../../applications/files/schemas/files-recents.schema.js'
import { files } from '../../applications/files/schemas/files.schema.js'
import { shares } from '../../applications/shares/schemas/shares.schema.js'
import { spacesRoots } from '../../applications/spaces/schemas/spaces-roots.schema.js'
import { spaces } from '../../applications/spaces/schemas/spaces.schema.js'
import { cache } from '../cache/schemas/mysql-cache.schema.js'
import { pathVarchar } from './columns.js'
import { DB_CHARSET, DB_PATH_COLLATION } from './constants.js'

describe('pathVarchar', () => {
  const columns = mysqlTable('path_columns', {
    path: pathVarchar('path', { length: 4096 }).notNull(),
    name: pathVarchar('name', { length: 255 }).notNull(),
    externalPath: pathVarchar('externalPath', { length: 4096 })
  })

  it('should include the character set and collation in the SQL type used by migrations', () => {
    expect(columns.path.getSQLType()).toBe(`varchar(4096) CHARACTER SET ${DB_CHARSET} COLLATE ${DB_PATH_COLLATION}`)
    expect(columns.name.getSQLType()).toBe(`varchar(255) CHARACTER SET ${DB_CHARSET} COLLATE ${DB_PATH_COLLATION}`)
    expect(columns.externalPath.getSQLType()).toBe(`varchar(4096) CHARACTER SET ${DB_CHARSET} COLLATE ${DB_PATH_COLLATION}`)
  })

  it('should preserve explicit column nullability', () => {
    expect(columns.path.notNull).toBe(true)
    expect(columns.name.notNull).toBe(true)
    expect(columns.externalPath.notNull).toBe(false)
  })

  it.each(['cafe', 'caf\u00e9', 'cafe\u0301', 'Photos', 'photos', 'dossier ', '100%_done='])('should preserve %j without normalization', (value) => {
    expect(columns.path.mapToDriverValue(value)).toBe(value)
    expect(columns.path.mapFromDriverValue(value)).toBe(value)
  })
})

describe('metadata schema collations', () => {
  it.each([
    { name: 'cache.key', column: cache.key, length: 768 },
    { name: 'files.path', column: files.path, length: 4096 },
    { name: 'files.name', column: files.name, length: 255 },
    { name: 'files_recents.path', column: filesRecents.path, length: 4096 },
    { name: 'files_recents.name', column: filesRecents.name, length: 255 },
    { name: 'spaces.alias', column: spaces.alias, length: 255 },
    { name: 'spaces.name', column: spaces.name, length: 255 },
    { name: 'spaces_roots.alias', column: spacesRoots.alias, length: 255 },
    { name: 'spaces_roots.name', column: spacesRoots.name, length: 255 },
    { name: 'spaces_roots.externalPath', column: spacesRoots.externalPath, length: 4096 },
    { name: 'shares.alias', column: shares.alias, length: 255 },
    { name: 'shares.name', column: shares.name, length: 255 },
    { name: 'shares.externalPath', column: shares.externalPath, length: 4096 }
  ])('declares the shared collation on $name', ({ column, length }) => {
    expect(column.getSQLType()).toBe(`varchar(${length}) CHARACTER SET ${DB_CHARSET} COLLATE ${DB_PATH_COLLATION}`)
  })

  it('preserves the cache primary key and JSON values', () => {
    expect(cache.key.primary).toBe(true)
    expect(cache.key.notNull).toBe(true)
    expect(cache.value.getSQLType()).toBe('json')
  })
})
