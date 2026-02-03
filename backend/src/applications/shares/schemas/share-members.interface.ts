import type { sharesMembers } from './shares-members.schema'

type ShareMembersSchema = typeof sharesMembers.$inferSelect

export class ShareMembers implements ShareMembersSchema {
  id: number
  shareId: number
  userId: number
  groupId: number
  linkId: number
  permissions: string
  createdAt: Date
  modifiedAt: Date
}
