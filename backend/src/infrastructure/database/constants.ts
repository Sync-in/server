import fs from 'node:fs'
import path from 'node:path'

export const DB_CHARSET = 'utf8mb4'
export const DB_TOKEN_PROVIDER = 'DB'
export const DB_SESSION_INIT_QUERIES = [
  // Use UTC for SQL date/time functions and TIMESTAMP values.
  `SET time_zone = '+00:00'`,
  // Use InnoDB for tables created without an explicit storage engine.
  `SET SESSION default_storage_engine = 'InnoDB'`
] as const
export const MIGRATIONS_PATH = path.relative(process.cwd(), path.join(__dirname, '../../../migrations'))

export function getSchemaPath(): string {
  // Look for schema.ts (dev) or schema.js (production), throw if none is found
  const extensions = ['js', 'ts']

  for (const ext of extensions) {
    const filePath = path.join(__dirname, `schema.${ext}`)
    if (fs.existsSync(filePath)) {
      return filePath
    }
  }

  throw new Error('No schema.ts or schema.js file found !')
}
