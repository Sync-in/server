import { sql } from 'drizzle-orm'
import { getDB } from './db'

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
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Database check failed: ${message}`)
  process.exitCode = 1
})
