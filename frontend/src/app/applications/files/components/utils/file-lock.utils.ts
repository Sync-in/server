/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Pipe, PipeTransform } from '@angular/core'
import type { FileLockProps } from '@sync-in-server/backend/src/applications/files/interfaces/file-props.interface'

export function fileLockPropsToString(lock: FileLockProps): string {
  const lockInfo = `${lock.info ? `${lock.info}` : ''}${lock.app ? ` ${lock.app}` : ''}`
  return `${lock.owner.fullName} (${lock.owner.email})${lockInfo ? ` - ${lockInfo}` : ''}`
}

@Pipe({
  name: 'fileLockFormatPipe',
  pure: true,
  standalone: true
})
export class FileLockFormatPipe implements PipeTransform {
  transform(lock: FileLockProps): string {
    if (!lock) return 'unknown'
    return fileLockPropsToString(lock)
  }
}
