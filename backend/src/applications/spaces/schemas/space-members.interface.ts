import type { spacesMembers } from './spaces-members.schema.js'

type SpaceMembersSchema = typeof spacesMembers.$inferSelect

export class SpaceMembers implements SpaceMembersSchema {
  id: number
  role: number
  spaceId: number
  userId: number
  groupId: number
  linkId: number
  permissions: string
  createdAt: Date
  modifiedAt: Date
}
