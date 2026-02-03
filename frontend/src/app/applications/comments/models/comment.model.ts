import type { Comment } from '@sync-in-server/backend/src/applications/comments/schemas/comment.interface'
import { userAvatarUrl } from '../../users/user.functions'

export class CommentModel implements Comment {
  id: number
  userId: number
  fileId: number
  content: string
  createdAt: Date
  modifiedAt: Date

  // extra properties
  author: Comment['author'] & { avatarUrl: string }
  isFileOwner: boolean

  // states
  dateToShow: Date
  isEdited: boolean
  wasModified = false
  isHover: boolean

  constructor(props: Comment) {
    Object.assign(this, props)
    this.author.avatarUrl = userAvatarUrl(this.author.login)
    this.wasModified = this.createdAt !== this.modifiedAt
    this.dateToShow = this.wasModified ? this.modifiedAt : this.createdAt
  }
}
