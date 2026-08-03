import { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { FILE_REPOSITORY } from '@sync-in-server/backend/src/applications/files/constants/operations'
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
import { resolveFileLocation } from '../../files/components/utils/file-location.utils'
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
    this.setProperties()
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

  private setProperties() {
    this.isWriteable = hasWritePermission(this.settings?.permissions)
    this.newly = getNewly(this.settings.lastSync || 0, true)
    const location = resolveFileLocation(this.settings.remotePath)
    if (!location) {
      this.showedPath = this.settings.remotePath.split('/').slice(1).join('/')
      this.iconClass = 'primary'
      return
    }
    this.showedPath = location.relativePath
    this.iconClass = location.iconClass
    this.icon = location.icon
    this.mime = location.repository === FILE_REPOSITORY.SHARE ? mimeDirectoryShare : mimeDirectory
  }
}
