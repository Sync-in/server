import { MySqlDialect, mysqlTable, varchar } from 'drizzle-orm/mysql-core'
import { concatDistinctObjectsInArray, getMysqlError } from './utils.js'

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

describe(getMysqlError.name, () => {
  it('extracts a mysql error through structural cause wrappers', () => {
    const mysqlError = Object.assign(new Error('deadlock'), {
      code: 'ER_LOCK_DEADLOCK',
      errno: 1213,
      sqlState: '40001',
      sqlMessage: 'Deadlock found'
    })

    const wrapper = Object.assign(new Error('query failed', { cause: mysqlError }), { code: 'ERR_QUERY' })
    expect(getMysqlError(wrapper)).toEqual({
      code: 'ER_LOCK_DEADLOCK',
      errno: 1213,
      sqlState: '40001',
      sqlMessage: 'Deadlock found'
    })
  })

  it('stops safely on circular cause chains', () => {
    const wrapper: { cause?: unknown } = {}
    wrapper.cause = wrapper

    expect(getMysqlError(wrapper)).toBeUndefined()
  })
})
