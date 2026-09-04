import { drizzle } from 'drizzle-orm/mysql2'
import { createConnection } from 'mysql2/promise'
import { configLoader } from '../../../configuration/config.loader'
import * as schema from '../schema'

export async function getDB() {
  const client = await createConnection(configLoader().mysql.url)
  return drizzle({ client, schema: { ...schema }, mode: 'default' })
}
