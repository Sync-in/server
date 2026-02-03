import fs from 'node:fs'
import path from 'node:path'

export const DB_CHARSET = 'utf8mb4'
export const DB_TOKEN_PROVIDER = 'DB'
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
