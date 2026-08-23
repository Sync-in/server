import { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import type { CommentRecent } from '@sync-in-server/backend/src/applications/comments/interfaces/comment-recent.interface'
import { FILE_REPOSITORY } from '@sync-in-server/backend/src/applications/files/constants/operations'
import { SPACE_ALIAS } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import { resolveFileLocation } from '../../files/components/utils/file-location.utils'
import { getAssetsMimeUrl } from '../../files/files.constants'
import { OwnerType } from '../../users/interfaces/owner.interface'
import { userAvatarUrl } from '../../users/user.functions'

export class CommentRecentModel implements CommentRecent {
  id: number
  content: string
  modifiedAt: Date
  author: OwnerType
  file: CommentRecent['file']

  // Computed
  mimeUrl: string
  avatarUrl: string
  icon: IconDefinition
  iconClass: 'primary' | 'purple'
  showedPath: string
  repositoryTitle: string
  inTrash: boolean

  constructor(props: CommentRecent) {
    Object.assign(this, props)
    if (this.author) {
      this.author.avatarUrl = userAvatarUrl(this.author.login)
    }
    this.mimeUrl = getAssetsMimeUrl(this.file.mime)
    const location = resolveFileLocation(this.file.path, {
      repository: this.file.fromShare ? FILE_REPOSITORY.SHARE : this.file.fromSpace ? FILE_REPOSITORY.SPACE : SPACE_ALIAS.PERSONAL,
      appendName: this.file.name,
      displayRootName: this.file.displayRootName
    })
    this.icon = location.icon
    this.iconClass = location.iconClass
    this.showedPath = location.relativePath
    this.repositoryTitle = location.repositoryTitle
    this.inTrash = !!this.file.inTrash
  }
}
