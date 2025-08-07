/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import path from 'node:path'
import { IS_DEV_ENV } from '../../configuration/config.constants'

export const DB_CHARSET = 'utf8mb4'
export const DB_TOKEN_PROVIDER = 'DB'
export const SCHEMA_PATH = path.join(__dirname, `schema${IS_DEV_ENV ? '.ts' : '.js'}`)
export const MIGRATIONS_PATH = path.join(__dirname, '../../../migrations')
