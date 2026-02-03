import type { usersGroups } from './users-groups.schema'

type UserGroupSchema = typeof usersGroups.$inferSelect

export class UserGroup implements UserGroupSchema {
  userId: number
  groupId: number
  role: number
  createdAt: Date
}
