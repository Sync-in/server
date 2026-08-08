import { MySqlDialect, mysqlTable, varchar } from 'drizzle-orm/mysql-core'
import { concatDistinctObjectsInArray } from './utils'

describe(concatDistinctObjectsInArray.name, () => {
  const dialect = new MySqlDialect()
  const records = mysqlTable('records', { value: varchar('value', { length: 255 }) })

  it('should bind JSON object keys instead of interpolating them', () => {
    const key = "name', (SELECT password FROM users), 'value"

    const query = dialect.sqlToQuery(concatDistinctObjectsInArray(records.value, { [key]: records.value }))

    expect(query.sql).not.toContain(key)
    expect(query.params).toContain(key)
  })
})
