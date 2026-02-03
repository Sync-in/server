import { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { FileTree } from '@sync-in-server/backend/src/applications/files/interfaces/file-tree.interface'
import { getAssetsMimeUrl, mimeDirectory, mimeDirectoryDisabled, mimeDirectoryShare, mimeDirectorySync } from '../../files/files.constants'
import { getServerPath, hasWritePermission, isSynchronizable } from '../sync.utils'

export class SyncWizardPath implements FileTree {
  id: number
  name: string
  path: string
  isDir = true
  mime = 'directory'
  hasChildren: boolean
  enabled: boolean
  permissions: string
  quotaIsExceeded: boolean
  inShare: boolean

  // extra properties
  isWriteable: boolean
  isSynchronizable: boolean
  isAlreadySynced = false
  serverPath: string
  selected?: boolean
  icon?: IconDefinition
  iconClass: 'primary' | 'purple'
  mimeUrl?: string

  constructor(props: FileTree | Partial<SyncWizardPath>) {
    this.isWriteable = hasWritePermission(props.permissions)
    Object.assign(this, props)
    if (!this.icon) {
      this.mimeUrl = getAssetsMimeUrl(this.enabled ? (this.inShare ? mimeDirectoryShare : mimeDirectory) : mimeDirectoryDisabled)
    }
    this.isSynchronizable = isSynchronizable(this.path)
    this.serverPath = getServerPath(this.path)
  }

  setAlreadySynced() {
    this.isAlreadySynced = true
    this.mimeUrl = getAssetsMimeUrl(mimeDirectorySync)
  }
}
