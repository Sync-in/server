import type { spaces } from './spaces.schema'

type SpaceSchema = typeof spaces.$inferSelect

export class Space implements SpaceSchema {
  id: number
  alias: string
  name: string
  enabled: boolean
  description: string
  storageUsage: number
  storageQuota: number
  storageIndexing: boolean
  createdAt: Date
  modifiedAt: Date
  disabledAt: Date
}
