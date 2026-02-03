import type { spacesRoots } from './spaces-roots.schema'

type SpaceRootSchema = typeof spacesRoots.$inferSelect

export class SpaceRoot implements SpaceRootSchema {
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
