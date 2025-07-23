/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { sanitizePath } from '../../files/utils/files'

export function PATH_TO_SPACE_SEGMENTS(path: string): string[] {
  return sanitizePath(path).split('/').filter(Boolean)
}
