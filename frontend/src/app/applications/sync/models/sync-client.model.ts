import type { SyncClientPaths } from '@sync-in-server/backend/src/applications/sync/interfaces/sync-client-paths.interface'
import type { SyncPath } from '@sync-in-server/backend/src/applications/sync/schemas/sync-path.interface'
import { currentTimeStamp, popFromObject } from '@sync-in-server/backend/src/common/shared'
import { SyncPathModel } from './sync-path.model'

export class SyncClientModel implements Omit<SyncClientPaths, 'paths'> {
  id: string
  tokenExpiration: number
  info: SyncClientPaths['info']
  enabled: boolean
  currentIp: string
  lastIp: string
  currentAccess: Date
  lastAccess: Date
  createdAt: Date
  isCurrentClient: boolean

  // extra properties
  paths: SyncPathModel[]
  osName: string
  expiration: { value: number; reached: boolean; approaching: boolean }

  constructor(client: SyncClientPaths) {
    this.paths = (popFromObject('paths', client) || []).map((path: SyncPath) => new SyncPathModel(path))
    Object.assign(this, client)
    this.setExpiration()
    this.setOsName()
  }

  setExpiration() {
    const expired = currentTimeStamp() >= this.tokenExpiration
    this.expiration = {
      value: this.tokenExpiration * 1000,
      reached: expired,
      approaching: expired ? false : currentTimeStamp() + 90 * 86400 >= this.tokenExpiration
    }
  }

  private setOsName() {
    if (this.info.os === 'darwin') {
      this.osName = 'macOS'
    } else if (this.info.os.startsWith('win')) {
      this.osName = 'Windows'
    } else if (this.info.os.startsWith('linux')) {
      this.osName = 'Linux'
    }
  }
}
