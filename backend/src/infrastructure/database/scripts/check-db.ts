import { sql } from 'drizzle-orm'
import { toErrorMessage } from '../../../common/errors.js'
import { DatabaseConfigurationError, getDB } from './db.js'

async function checkConnection() {
  const db = await getDB()

  try {
    await db.execute(sql`SELECT 1`)
    console.log('Database is ready and accepting queries!')
  } finally {
    await db.$client.end()
  }
}

checkConnection().catch((error: unknown) => {
  const isConfigurationError = error instanceof DatabaseConfigurationError
  console.error(`${isConfigurationError ? 'Database configuration error' : 'Database check failed'}: ${toErrorMessage(error)}`)
  process.exitCode = isConfigurationError ? 2 : 1
})
