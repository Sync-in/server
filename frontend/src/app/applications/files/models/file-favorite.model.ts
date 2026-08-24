import type { FileFavorite } from '@sync-in-server/backend/src/applications/files/schemas/file-favorite.interface'
import { getNewly } from '../../../common/utils/functions'
import { dJs } from '../../../common/utils/time'
import { FileLocationModel } from './file-location.model'

export class FileFavoriteModel extends FileLocationModel implements FileFavorite {
  fileId: number
  isDir: boolean
  size: number
  ctime: number
  createdAt: Date
  isDisabled: boolean
  hTimeAgo: string
  newly = 0

  constructor(props: FileFavorite) {
    super(props, props.repository)
    this.hTimeAgo = dJs(this.mtime).fromNow(true)
    this.newly = getNewly(this.mtime)
  }
}
