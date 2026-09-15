import { drizzle } from 'drizzle-orm/mysql2'
import { createConnection } from 'mysql2/promise'
import { configLoader } from '../../../configuration/config.loader'
import * as schema from '../schema'

export class DatabaseConfigurationError extends Error {}

export async function getDB() {
  const mysqlUrl = configLoader().mysql?.url
  if (typeof mysqlUrl !== 'string' || !mysqlUrl.trim()) {
    throw new DatabaseConfigurationError(
      'MySQL URL is not configured. Define "mysql.url" in environment.yaml or set the SYNCIN_MYSQL_URL environment variable.'
    )
  }

  const client = await createConnection(mysqlUrl)
  return drizzle({ client, schema: { ...schema }, mode: 'default' })
}
