import { SyncClientInfo } from '../interfaces/sync-client.interface.js'
import type { syncClients } from './sync-clients.schema.js'

type SyncClientSchema = typeof syncClients.$inferSelect

export class SyncClient implements SyncClientSchema {
  id: string
  ownerId: number
  token: string
  tokenExpiration: number
  info: SyncClientInfo
  enabled: boolean
  currentIp: string
  lastIp: string
  currentAccess: Date
  lastAccess: Date
  createdAt: Date
}
