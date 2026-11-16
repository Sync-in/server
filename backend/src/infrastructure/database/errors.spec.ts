import { toErrorLog } from '../errors.js'
import { getMysqlError } from './errors.js'

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

  it('extracts transport errors only from a known database boundary', () => {
    const mysqlError = Object.assign(new Error('connect timed out'), { code: 'ETIMEDOUT' })
    const wrapper = Object.assign(new Error('query failed', { cause: new AggregateError([mysqlError]) }), {
      query: 'select ?',
      params: ['secret']
    })

    expect(getMysqlError(wrapper)).toEqual({
      code: 'ETIMEDOUT',
      errno: undefined,
      sqlState: undefined,
      sqlMessage: undefined
    })
    const error = Object.assign(new Error('connect timed out'), { code: 'ETIMEDOUT', errno: -60, fatal: true })

    expect(getMysqlError(error)).toBeUndefined()
    expect(getMysqlError(error, true)).toEqual({
      code: 'ETIMEDOUT',
      errno: -60,
      sqlState: undefined,
      sqlMessage: undefined,
      fatal: true
    })
  })

  it('does not expose query parameters or sensitive mysql messages', () => {
    const mysqlError = Object.assign(new Error('duplicate entry'), {
      code: 'ER_DUP_ENTRY',
      errno: 1062,
      sqlState: '23000',
      sqlMessage: "Duplicate entry 'secret@example.com' for key 'users.email'"
    })

    const details = getMysqlError(new Error('Failed query: insert into users\nparams: secret@example.com', { cause: mysqlError }))

    expect(details).toEqual({
      code: 'ER_DUP_ENTRY',
      errno: 1062,
      sqlState: '23000',
      sqlMessage: '[redacted]'
    })
    expect(JSON.stringify(details)).not.toContain('secret@example.com')
    const error = Object.assign(new Error('Failed query: select ?\nparams: secret@example.com'), {
      query: 'select ?',
      params: ['secret@example.com']
    })

    const drizzleLog = toErrorLog(error, 'Unable to execute query')

    expect(drizzleLog).toEqual({
      msg: 'Unable to execute query',
      mysql: {
        code: 'DRIZZLE_QUERY_ERROR',
        errno: undefined,
        sqlState: undefined,
        sqlMessage: undefined
      }
    })
    expect(JSON.stringify(drizzleLog)).not.toContain('secret@example.com')
    expect(toErrorLog(new Error('unexpected failure'), 'Unable to execute query')).toEqual({
      msg: 'Unable to execute query: unexpected failure'
    })
  })

  it('stops safely on circular cause chains', () => {
    const wrapper: { cause?: unknown } = {}
    wrapper.cause = wrapper

    expect(getMysqlError(wrapper)).toBeUndefined()
  })
})
