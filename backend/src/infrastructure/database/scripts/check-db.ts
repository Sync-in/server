import { sql } from 'drizzle-orm'
import { getDB } from './db'

async function checkConnection() {
  try {
    const db = await getDB()
    await db.execute(sql`SELECT 1`)
    console.log('Database is ready and accepting queries!')
    process.exit(0)
  } catch (error: any) {
    console.error(`Database check failed: ${error.message}`)
    process.exit(1)
  }
}

checkConnection()
