import { DrizzleQueryError } from 'drizzle-orm/errors'
import { migrate } from 'drizzle-orm/mysql2/migrator'
import { MIGRATIONS_PATH } from '../constants'
import { getDB } from './db'

async function applyMigrations(): Promise<void> {
  const db = await getDB()

  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_PATH })
    console.log('Database migrations applied successfully!')
  } finally {
    await db.$client.promise().end()
  }
}

applyMigrations().catch((error: unknown) => {
  console.error('Database migration failed!')

  if (error instanceof DrizzleQueryError) {
    console.error(`Failed SQL query:\n${error.query}`)
    if (error.params.length > 0) {
      console.error('Parameters:', error.params)
    }
    console.error('Database error:', error.cause)
  } else {
    console.error(error)
  }

  process.exitCode = 1
})
