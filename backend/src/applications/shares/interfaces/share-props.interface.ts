import type { FileSpace } from '../../files/interfaces/file-space.interface.js'
import type { Member } from '../../users/interfaces/member.interface.js'
import type { Share } from '../schemas/share.interface.js'

export interface ShareProps extends Pick<
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
  parent: Pick<Share, 'id' | 'ownerId' | 'alias' | 'name'>
  file: FileSpace

  // Extra properties
  members: Member[]
}
