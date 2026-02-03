import { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { getNewly } from '../../../common/utils/functions'
import { dJs } from '../../../common/utils/time'
import { defaultMimeUrl, getAssetsMimeUrl } from '../../files/files.constants'
import {
  SYNC_TRANSFER_ACTION,
  SYNC_TRANSFER_ACTION_ICON,
  SYNC_TRANSFER_SIDE,
  SYNC_TRANSFER_SIDE_CLASS,
  SYNC_TRANSFER_SIDE_ICON
} from '../constants/transfer'
import { SyncTransfer } from '../interfaces/sync-transfer.interface'

export class SyncTransferModel implements SyncTransfer {
  ok?: boolean
  name?: string
  side: SYNC_TRANSFER_SIDE
  action: keyof typeof SYNC_TRANSFER_ACTION
  file: string
  isDir: boolean
  fileDst?: string
  mime?: string
  error?: string
  syncPathId?: number

  // transfer logs
  id?: number
  timestamp?: Date | string
  syncPathName?: string

  // extra properties
  selected = false
  hovered = false // really used in templates
  isFiltered = false
  sideIconClass: string
  sideIcon: IconDefinition
  actionIcon: IconDefinition
  actionText: string
  mimeUrl: string
  newly = 0
  hTimeAgo: string

  constructor(props: SyncTransfer) {
    Object.assign(this, props)
    this.sideIcon = SYNC_TRANSFER_SIDE_ICON[this.side]
    this.sideIconClass = SYNC_TRANSFER_SIDE_CLASS[this.side]
    this.actionText = SYNC_TRANSFER_ACTION[this.action]
    this.actionIcon = SYNC_TRANSFER_ACTION_ICON[this.actionText]
    this.isFiltered = this.actionText === SYNC_TRANSFER_ACTION.FILTERED
    this.mimeUrl = getAssetsMimeUrl(this.mime)
    if (this.timestamp) {
      this.hTimeAgo = dJs(this.timestamp).fromNow(true)
      this.timestamp = dJs(this.timestamp).format('YYYY-MM-DD HH:mm:ss')
      this.newly = getNewly(this.timestamp)
    }
  }

  fallBackMimeUrl() {
    this.mimeUrl = defaultMimeUrl
  }
}
