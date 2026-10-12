import type { Owner } from '../../users/interfaces/owner.interface.js'
import type { comments } from './comments.schema.js'

type CommentSchema = typeof comments.$inferSelect

export interface Comment extends CommentSchema {
  // extra properties
  author: Owner & { isAuthor: boolean }
  isFileOwner: boolean
}
