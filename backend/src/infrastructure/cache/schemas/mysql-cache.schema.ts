import { sql } from 'drizzle-orm'
import { index, int, mysqlTable, uniqueIndex } from 'drizzle-orm/mysql-core'
import { jsonColumn, pathVarchar } from '../../database/columns.js'

export const cache = mysqlTable(
  'cache',
  {
    key: pathVarchar('key', { length: 8192 }).notNull(),
    value: jsonColumn<any>()('value'),
    expiration: int('expiration').default(-1).notNull()
  },
  (table) => [
    uniqueIndex('cache_key_unique').on(table.key),
    index('cache_key_prefix_idx').on(sql`${table.key}(768)`),
    index('expiration_idx').on(table.expiration)
  ]
)
