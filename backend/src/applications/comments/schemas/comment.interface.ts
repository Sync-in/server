import { Owner } from '../../users/interfaces/owner.interface'
import type { comments } from './comments.schema'

type CommentSchema = typeof comments.$inferSelect

export class Comment implements CommentSchema {
  id: number
  userId: number
  fileId: number
  content: string
  createdAt: Date
  modifiedAt: Date

  // extra properties
  author: Owner & { isAuthor: boolean }
  isFileOwner: boolean
}
