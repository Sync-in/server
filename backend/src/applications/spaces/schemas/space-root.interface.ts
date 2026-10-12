import type { spacesRoots } from './spaces-roots.schema.js'

type SpaceRootSchema = typeof spacesRoots.$inferSelect

export interface SpaceRoot extends SpaceRootSchema {
  id: number
  alias: string
  name: string
  spaceId: number
  ownerId: number
  fileId: number
  externalPath: string
  permissions: string
  createdAt: Date
  modifiedAt: Date
}
