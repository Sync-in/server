/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import type { spaces } from './spaces.schema'

type SpaceSchema = typeof spaces.$inferSelect

export class Space implements SpaceSchema {
  id: number
  alias: string
  name: string
  enabled: boolean
  description: string
  storageUsage: number
  storageQuota: number
  storageIndexing: boolean
  createdAt: Date
  modifiedAt: Date
  disabledAt: Date
}
