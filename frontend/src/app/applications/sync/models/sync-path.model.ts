/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { SPACE_REPOSITORY } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import { SyncPathFromClient, SyncPathSettings } from '@sync-in-server/backend/src/applications/sync/interfaces/sync-path.interface'
import type { SyncPath } from '@sync-in-server/backend/src/applications/sync/schemas/sync-path.interface'
import { popFromObject } from '@sync-in-server/backend/src/common/shared'
import { getNewly } from '../../../common/utils/functions'
import {
  getAssetsMimeUrl,
  mimeDirectory,
  mimeDirectoryDisabled,
  mimeDirectoryError,
  mimeDirectoryShare,
  mimeDirectorySync
} from '../../files/files.constants'
import { SPACES_ICON, SPACES_PATH } from '../../spaces/spaces.constants'
import { hasWritePermission } from '../sync.utils'

export class SyncPathModel implements Partial<SyncPath> {
  id: number
  settings: SyncPathSettings
  createdAt: Date

  // From client
  firstSync: boolean
  mainError: string = null
  lastErrors: any[] = []

  // Computed
  newly = 0
  mimeUrl: string
  mime: string
  icon: IconDefinition
  iconClass: 'primary' | 'purple'
  showedPath: string
  isWriteable: boolean
  // Sync status
  inSync = false
  nbSyncTasks = 0

  constructor(props: SyncPathFromClient, fromClient: true)
  constructor(props: Partial<SyncPath>, fromClient?: boolean)
  constructor(props: Partial<SyncPath> | SyncPathFromClient, fromClient: boolean = false) {
    if (fromClient) {
      this.id = popFromObject('id', props)
      this.firstSync = popFromObject('firstSync', props)
      this.mainError = popFromObject('mainError', props)
      this.lastErrors = popFromObject('lastErrors', props)
      this.settings = props as SyncPathSettings
    } else {
      Object.assign(this, props)
    }
    this.setInfos()
    this.setStatus(false)
  }

  setStatus(inSync: boolean) {
    if (inSync) {
      this.mimeUrl = getAssetsMimeUrl(mimeDirectorySync)
      this.inSync = true
    } else {
      this.nbSyncTasks = 0
      this.inSync = false
      this.newly = getNewly(this.settings.lastSync || 0, true)
      if (this.settings.enabled) {
        if (this.mainError) {
          this.mimeUrl = getAssetsMimeUrl(mimeDirectoryError)
        } else {
          this.mimeUrl = getAssetsMimeUrl(this.mime)
        }
      } else {
        this.mimeUrl = getAssetsMimeUrl(mimeDirectoryDisabled)
      }
    }
  }

  export(withId = false): Partial<SyncPathSettings> {
    return {
      ...(withId ? { id: this.id } : {}),
      name: this.settings.name,
      mode: this.settings.mode,
      enabled: this.settings.enabled,
      diffMode: this.settings.diffMode,
      conflictMode: this.settings.conflictMode,
      filters: this.settings.filters,
      scheduler: this.settings.scheduler
    }
  }

  private setInfos() {
    this.isWriteable = hasWritePermission(this.settings?.permissions)
    this.newly = getNewly(this.settings.lastSync || 0, true)
    const repository = this.settings.remotePath.split('/')[0]
    this.showedPath = this.settings.remotePath.split('/').slice(1).join('/')
    this.iconClass = repository === SPACE_REPOSITORY.SHARES ? 'purple' : 'primary'
    switch (repository) {
      case SPACES_PATH.PERSONAL:
        this.icon = SPACES_ICON.PERSONAL
        this.mime = mimeDirectory
        break
      case SPACES_PATH.SPACES:
        this.icon = SPACES_ICON.SPACES
        this.mime = mimeDirectory
        break
      case SPACES_PATH.SHARES:
        this.icon = SPACES_ICON.SHARES
        this.mime = mimeDirectoryShare
        break
    }
  }
}
