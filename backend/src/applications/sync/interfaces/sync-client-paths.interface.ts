import { SyncClient } from '../schemas/sync-client.interface'
import { SyncPath } from '../schemas/sync-path.interface'
import { SyncClientInfo } from './sync-client.interface'

export interface SyncClientPaths extends Partial<SyncClient> {
  id: string
  tokenExpiration: number
  info: SyncClientInfo
  enabled: boolean
  currentIp: string
  lastIp: string
  currentAccess: Date
  lastAccess: Date
  createdAt: Date

  // extra property
  isCurrentClient: boolean
  paths: SyncPath[]
}
