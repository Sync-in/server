/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import path from 'node:path'
import fs from 'node:fs'

export const DB_CHARSET = 'utf8mb4'
export const DB_TOKEN_PROVIDER = 'DB'
export const MIGRATIONS_PATH = path.relative(process.cwd(), path.join(__dirname, '../../../migrations'))

export function getSchemaPath(): string {
  // Look for schema.ts (dev) or schema.js (production), throw if none is found
  const extensions = ['js', 'ts']

  for (const ext of extensions) {
    const filePath = path.join(__dirname, `schema.${ext}`)
    if (fs.existsSync(filePath)) {
      console.log('USE SCHEMA PATH', filePath)
      return filePath
    }
  }

  throw new Error('No schema.ts or schema.js file found !')
}
