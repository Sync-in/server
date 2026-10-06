import type { SYNC_CLIENT_TYPE } from '../constants/sync.js'

export interface SyncClientInfo {
  node: string
  os: string
  osRelease: string
  user: string
  type: SYNC_CLIENT_TYPE
  version: string
}
