import type { Owner } from '../../users/interfaces/owner.interface'

export interface CommentRecent {
  id: number
  content: string
  modifiedAt: Date
  author: Owner
  file: { name: string; path: string; mime: string; inTrash: number; fromSpace: number; fromShare: number }
}
