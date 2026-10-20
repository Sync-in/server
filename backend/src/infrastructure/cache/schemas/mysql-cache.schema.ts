import { index, int, mysqlTable } from 'drizzle-orm/mysql-core'
import { jsonColumn, pathVarchar } from '../../database/columns.js'

export const cache = mysqlTable(
  'cache',
  {
    key: pathVarchar('key', { length: 768 }).primaryKey(),
    value: jsonColumn<any>()('value'),
    expiration: int('expiration').default(-1).notNull()
  },
  (table) => [index('expiration_idx').on(table.expiration)]
)
