/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import type { shares } from './shares.schema'

type ShareSchema = typeof shares.$inferSelect

export class Share implements ShareSchema {
  id: number
  ownerId: number
  parentId: number
  spaceId: number
  spaceRootId: number
  fileId: number
  externalPath: string
  type: number
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
