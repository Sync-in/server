import { RETRYABLE_CONNECTION_ERROR_CODES } from '../constants.js'

const DRIZZLE_QUERY_ERROR_CODE = 'DRIZZLE_QUERY_ERROR'
const SAFE_MYSQL_ERROR_CODES = new Set(['ER_CON_COUNT_ERROR', 'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT', 'ER_SERVER_SHUTDOWN'])

export function getMysqlError(error: unknown, includeConnectionErrors = false) {
  // Drizzle wraps mysql2 failures in nested causes; preserve structured driver details without exposing its query or parameters.
  // Bare Node connection errors are accepted only at boundaries that already know MySQL is their source.
  let isDrizzleQueryError = false

  for (const current of errorChain(error)) {
    if (hasDrizzleQueryShape(current)) isDrizzleQueryError = true
    try {
      const candidate = current as Record<string, unknown>
      const code = typeof candidate.code === 'string' ? candidate.code : undefined
      if (!code) continue

      const errno = typeof candidate.errno === 'number' ? candidate.errno : undefined
      const sqlState = typeof candidate.sqlState === 'string' ? candidate.sqlState : undefined
      const rawSqlMessage = typeof candidate.sqlMessage === 'string' ? candidate.sqlMessage : undefined
      const sqlMessage = rawSqlMessage === undefined ? undefined : SAFE_MYSQL_ERROR_CODES.has(code) ? rawSqlMessage : '[redacted]'
      const fatal = typeof candidate.fatal === 'boolean' ? candidate.fatal : undefined
      if (
        code.startsWith('ER_') ||
        code.startsWith('PROTOCOL_') ||
        ((isDrizzleQueryError || includeConnectionErrors) && (RETRYABLE_CONNECTION_ERROR_CODES.has(code) || errno !== undefined)) ||
        sqlState !== undefined ||
        sqlMessage !== undefined
      ) {
        return { code, errno, sqlState, sqlMessage, ...(fatal === undefined ? {} : { fatal }) }
      }
    } catch {
      continue
    }
  }
  return isDrizzleQueryError ? { code: DRIZZLE_QUERY_ERROR_CODE, errno: undefined, sqlState: undefined, sqlMessage: undefined } : undefined
}

function* errorChain(error: unknown): Generator<object> {
  const pending = [error]
  const visited = new Set<object>()

  while (pending.length) {
    const current = pending.pop()
    if (current === null || typeof current !== 'object' || visited.has(current)) continue
    visited.add(current)
    yield current

    try {
      if ('errors' in current && Array.isArray(current.errors)) {
        for (let index = current.errors.length - 1; index >= 0; index--) pending.push(current.errors[index])
      }
    } catch {
      // Ignore inaccessible aggregate members.
    }
    try {
      if ('cause' in current) pending.push(current.cause)
    } catch {
      // Ignore inaccessible cause properties.
    }
  }
}

function hasDrizzleQueryShape(error: object): boolean {
  try {
    return 'query' in error && typeof error.query === 'string' && 'params' in error && Array.isArray(error.params)
  } catch {
    return false
  }
}
