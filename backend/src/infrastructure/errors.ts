import { toErrorMessage } from '../common/errors.js'
import { getMysqlError } from './database/errors.js'
import { connectionErrorMessage } from './utils.js'

export function toErrorLog(error: unknown, message: string, connectionBoundary = false) {
  const mysql = getMysqlError(error, connectionBoundary)
  if (mysql) return { msg: message, mysql }

  const errorMessage = connectionBoundary ? connectionErrorMessage(error) : toErrorMessage(error)
  return { msg: `${message}: ${errorMessage}` }
}
