import type { FileSpace } from '@sync-in-server/backend/src/applications/files/interfaces/file-space.interface'
import type { ShareFile } from '@sync-in-server/backend/src/applications/shares/interfaces/share-file.interface'
import { getNewly } from '../../../common/utils/functions'
import { dJs } from '../../../common/utils/time'
import { defaultMimeUrl } from '../../files/files.constants'
import { setMimeUrl } from '../shares.functions'

export class ShareFileModel implements ShareFile {
  id: number
  alias: string
  name: string
  description: string
  enabled: boolean
  externalPath: boolean
  createdAt: Date
  modifiedAt: Date
  parent: { id: number; alias: string; name: string }
  file: FileSpace
  counts: { users: number; groups: number; links: number; shares: number }
  syncs: { clientId: string; clientName: string; id: number }[] = []
  hasComments: boolean

  // Computed
  mimeUrl: string
  hTimeAgo: string
  // States
  newly = 0

  constructor(props: ShareFile) {
    Object.assign(this, props)
    setMimeUrl(this)
    this.hTimeAgo = dJs(this.createdAt).fromNow(true)
    this.newly = getNewly(this.createdAt)
  }

  fallBackMimeUrl() {
    this.mimeUrl = defaultMimeUrl
  }
}
