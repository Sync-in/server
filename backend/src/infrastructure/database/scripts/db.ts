import { drizzle } from 'drizzle-orm/mysql2'
import { configLoader } from '../../../configuration/config.loader'
import * as schema from '../schema'

export async function getDB() {
  return drizzle(configLoader().mysql.url, { schema: { ...schema }, mode: 'default' })
}
