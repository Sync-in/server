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
  hasComments: boolean
  shares: { id: number; alias: string; name: string; type: number }[] = []
  links: { id: number; alias: string; name: string; type: number }[] = []
  spaces: { id: number; alias: string; name: string }[] = []
  syncs: { clientId: string; clientName: string; id: number }[] = []
  isDisabled: boolean
  hTimeAgo: string
  nbBadges = 0
  galleryBadges: ('shares' | 'spaces' | 'links' | 'syncs' | 'comments')[] = []
  newly = 0

  constructor(props: FileFavorite) {
    super(props, props.repository)
    this.setShares(props.shares)
    this.spaces = props.spaces || []
    this.syncs = props.syncs || []
    this.hTimeAgo = dJs(this.mtime).fromNow(true)
    this.newly = getNewly(this.mtime)
    this.updateNbBadges()
  }

  private updateNbBadges() {
    if (this.shares.length) this.galleryBadges.push('shares')
    if (this.spaces.length) this.galleryBadges.push('spaces')
    if (this.links.length) this.galleryBadges.push('links')
    if (this.syncs.length) this.galleryBadges.push('syncs')
    if (this.hasComments) this.galleryBadges.push('comments')
    this.nbBadges = this.galleryBadges.length
  }

  private setShares(shares: { id: number; alias: string; name: string; type: number }[]) {
    for (const share of shares || []) {
      if (share.type === 0) {
        this.shares.push(share)
      } else {
        this.links.push(share)
      }
    }
  }
}
