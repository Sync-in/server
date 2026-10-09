import type { SyncClient } from '../schemas/sync-client.interface.js'
import type { SyncPath } from '../schemas/sync-path.interface.js'
import { SyncClientInfo } from './sync-client.interface.js'

export interface SyncClientPaths extends Partial<SyncClient> {
  id: string
  tokenExpiration: number
  info: SyncClientInfo
  enabled: boolean
  currentIp: string | null
  lastIp: string | null
  currentAccess: Date | null
  lastAccess: Date | null
  createdAt: Date

  // extra property
  isCurrentClient: boolean
  paths: SyncPath[]
}
