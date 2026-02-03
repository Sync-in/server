import { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import type { CommentRecent } from '@sync-in-server/backend/src/applications/comments/interfaces/comment-recent.interface'
import { SPACE_ALIAS } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import { getAssetsMimeUrl } from '../../files/files.constants'
import { SPACES_ICON } from '../../spaces/spaces.constants'
import { OwnerType } from '../../users/interfaces/owner.interface'
import { userAvatarUrl } from '../../users/user.functions'

export class CommentRecentModel implements CommentRecent {
  id: number
  content: string
  modifiedAt: Date
  author: OwnerType
  file: { name: string; path: string; mime: string; inTrash: number; fromSpace: number; fromShare: number }

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
    this.icon = this.file.fromShare ? SPACES_ICON.SHARES : this.file.fromSpace ? SPACES_ICON.SPACES : SPACES_ICON.PERSONAL
    this.iconClass = this.file.fromShare ? 'purple' : 'primary'
    this.showedPath = [...this.file.path.split('/').slice(this.file.path.split('/')[1] === SPACE_ALIAS.PERSONAL ? 2 : 1), this.file.name].join('/')
  }
}
