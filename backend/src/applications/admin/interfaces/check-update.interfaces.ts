/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

export interface ServerReleaseVersionManifest {
  // tag_name: `v1.0.0`
  tag_name: string
}

export interface ServerReleaseNotification {
  version: string
}
