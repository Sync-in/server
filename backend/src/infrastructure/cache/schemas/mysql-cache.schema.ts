import { sql } from 'drizzle-orm'
import { binary, index, int, mysqlTable, uniqueIndex } from 'drizzle-orm/mysql-core'
import { jsonColumn, pathVarchar } from '../../database/columns.js'
import { DB_BINARY_COLLATION } from '../../database/constants.js'

export const cache = mysqlTable(
  'cache',
  {
    key: pathVarchar('key', { length: 8192, collation: DB_BINARY_COLLATION }).notNull(),
    keyHash: binary('key_hash', { length: 32 }).generatedAlwaysAs(sql`unhex(sha2(\`key\`, 256))`, { mode: 'stored' }),
    value: jsonColumn<any>()('value'),
    expiration: int('expiration').default(-1).notNull()
  },
  (table) => [
    uniqueIndex('cache_key_hash_unique').on(table.keyHash),
    index('cache_key_prefix_idx').on(sql`${table.key}(768)`),
    index('expiration_idx').on(table.expiration)
  ]
)
