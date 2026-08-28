import type { CommentRecentModel } from '../../comments/models/comment-recent.model'
import type { FileRecentModel } from '../../files/models/file-recent.model'

export interface RecentsTimelineFileItem {
  key: string
  kind: 'file'
  timestamp: number
  file: FileRecentModel
}

export interface RecentsTimelineCommentItem {
  key: string
  kind: 'comment'
  timestamp: number
  comment: CommentRecentModel
}

export type RecentsTimelineItem = RecentsTimelineFileItem | RecentsTimelineCommentItem
export type RecentsTimelineFilter = 'all' | RecentsTimelineItem['kind']
export type RecentsTimelinePeriod = 'today' | 'yesterday' | 'week' | 'older'

export interface RecentsTimelineGroup {
  key: string
  date: number
  startDate: number
  endDate: number
  period: RecentsTimelinePeriod
  items: RecentsTimelineItem[]
}
