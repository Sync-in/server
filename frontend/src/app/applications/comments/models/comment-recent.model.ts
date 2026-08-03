import { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import type { CommentRecent } from '@sync-in-server/backend/src/applications/comments/interfaces/comment-recent.interface'
import { resolveFileLocation } from '../../files/components/utils/file-location.utils'
import { getAssetsMimeUrl } from '../../files/files.constants'
import { OwnerType } from '../../users/interfaces/owner.interface'
import { userAvatarUrl } from '../../users/user.functions'

export class CommentRecentModel implements CommentRecent {
  id: number
  content: string
  modifiedAt: Date
  author: OwnerType
  file: { name: string; path: string; mime: string; inTrash: number; fromSpace: number; fromShare: number; displayRootName?: string }

  // Computed
  mimeUrl: string
  avatarUrl: string
  icon: IconDefinition
  iconClass: 'primary' | 'purple'
  showedPath: string

  constructor(props: CommentRecent) {
    Object.assign(this, props)
    if (this.author) {
      this.author.avatarUrl = userAvatarUrl(this.author.login)
    }
    this.mimeUrl = getAssetsMimeUrl(this.file.mime)
    const location = resolveFileLocation(this.file.path, {
      repository: this.file.fromShare ? 'share' : this.file.fromSpace ? 'space' : 'personal',
      appendName: this.file.name,
      displayRootName: this.file.displayRootName
    })
    this.icon = location.icon
    this.iconClass = location.iconClass
    this.showedPath = location.relativePath
  }
}
