/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { faApple, faLinux, faWindows } from '@fortawesome/free-brands-svg-icons'
import type { SyncClientPaths } from '@sync-in-server/backend/src/applications/sync/interfaces/sync-client-paths.interface'
import type { SyncPath } from '@sync-in-server/backend/src/applications/sync/schemas/sync-path.interface'
import { currentTimeStamp, popFromObject } from '@sync-in-server/backend/src/common/shared'
import { SyncPathModel } from './sync-path.model'

export class SyncClientModel implements Omit<SyncClientPaths, 'paths'> {
  id: string
  tokenExpiration: number
  info: SyncClientPaths['info']
  enabled: boolean
  currentIp: string
  lastIp: string
  currentAccess: Date
  lastAccess: Date
  createdAt: Date
  isCurrentClient: boolean

  // extra properties
  paths: SyncPathModel[]
  icon: IconDefinition
  osName: string
  expiration: { value: number; reached: boolean; approaching: boolean }

  constructor(client: SyncClientPaths) {
    this.paths = (popFromObject('paths', client) || []).map((path: SyncPath) => new SyncPathModel(path))
    Object.assign(this, client)
    this.setExpiration()
    this.setIcon()
  }

  setExpiration() {
    const expired = currentTimeStamp() >= this.tokenExpiration
    this.expiration = {
      value: this.tokenExpiration * 1000,
      reached: expired,
      approaching: expired ? false : currentTimeStamp() + 90 * 86400 >= this.tokenExpiration
    }
  }

  private setIcon() {
    if (this.info.os === 'darwin') {
      this.icon = faApple
      this.osName = 'macOS'
    } else if (this.info.os.startsWith('win')) {
      this.icon = faWindows
      this.osName = 'Windows'
    } else if (this.info.os.startsWith('linux')) {
      this.icon = faLinux
      this.osName = 'Linux'
    }
  }
}
