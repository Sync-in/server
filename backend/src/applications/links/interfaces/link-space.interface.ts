/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import type { FileEditorProvider } from '../../../configuration/config.interfaces'

export interface SpaceLink {
  share?: {
    name: string
    alias: string
    hasParent: boolean
    isDir: boolean
    mtime: number
    mime: string
    size: number
    permissions: string
  } | null
  space?: { name: string; alias: string } | null
  owner?: { login?: string; fullName: string; avatar?: string } | null
  fileEditors?: FileEditorProvider
}
