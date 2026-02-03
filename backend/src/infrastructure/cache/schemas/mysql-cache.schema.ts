import { index, int, mysqlTable, varchar } from 'drizzle-orm/mysql-core'
import { jsonColumn } from '../../database/columns'

export const cache = mysqlTable(
  'cache',
  {
    key: varchar('key', { length: 768 }).primaryKey(),
    value: jsonColumn<any>()('value'),
    expiration: int('expiration').default(-1).notNull()
  },
  (table) => [index('expiration_idx').on(table.expiration)]
)
