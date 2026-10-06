import type { groups } from './groups.schema.js'

type GroupSchema = typeof groups.$inferSelect

export class Group implements GroupSchema {
  id: number
  name: string
  description: string
  type: number
  visibility: number
  parentId: number
  permissions: string
  createdAt: Date
  modifiedAt: Date
}
