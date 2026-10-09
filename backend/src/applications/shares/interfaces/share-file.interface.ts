import type { FileSpace } from '../../files/interfaces/file-space.interface.js'
import type { Share } from '../schemas/share.interface.js'

export interface ShareFile extends Pick<Share, 'id' | 'name' | 'description' | 'alias' | 'createdAt' | 'modifiedAt'> {
  externalPath: boolean
  enabled: Share['enabled']
  parent: Pick<Share, 'id' | 'alias' | 'name'>
  file: FileSpace
  hasComments: boolean
  counts: { users: number; groups: number; links: number; shares: number }
  syncs: { clientId: string; clientName: string; id: number }[]
}
