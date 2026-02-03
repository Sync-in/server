import type { SyncPathSettings } from '../interfaces/sync-path.interface'
import { syncPaths } from './sync-paths.schema'

type SyncPathSchema = typeof syncPaths.$inferSelect

export class SyncPath implements SyncPathSchema {
  id: number
  clientId: string
  ownerId: number
  spaceId: number
  spaceRootId: number
  shareId: number
  fileId: number
  settings: SyncPathSettings
  createdAt: Date
}
