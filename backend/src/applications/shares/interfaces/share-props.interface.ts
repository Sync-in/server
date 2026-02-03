import type { FileSpace } from '../../files/interfaces/file-space.interface'
import type { Member } from '../../users/interfaces/member.interface'
import type { Share } from '../schemas/share.interface'

export class ShareProps implements Pick<
  Share,
  | 'id'
  | 'ownerId'
  | 'name'
  | 'alias'
  | 'enabled'
  | 'description'
  | 'externalPath'
  | 'createdAt'
  | 'modifiedAt'
  | 'disabledAt'
  | 'storageUsage'
  | 'storageQuota'
  | 'storageIndexing'
> {
  id: number
  ownerId: number
  alias: string
  name: string
  description: string
  enabled: boolean
  externalPath: string
  storageUsage: number
  storageQuota: number
  storageIndexing: boolean
  createdAt: Date
  modifiedAt: Date
  disabledAt: Date
  parent: Pick<Share, 'id' | 'ownerId' | 'alias' | 'name'>
  file: FileSpace

  // Extra properties
  members: Member[] = []
}
