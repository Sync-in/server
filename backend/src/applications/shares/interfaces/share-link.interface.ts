import type { FileSpace } from '../../files/interfaces/file-space.interface.js'
import type { LinkGuest } from '../../links/interfaces/link-guest.interface.js'
import type { Share } from '../schemas/share.interface.js'

export interface ShareLink extends Pick<Share, 'id' | 'name' | 'alias' | 'ownerId' | 'description'> {
  ownerId: number
  externalPath: string
  parent: Pick<Share, 'id' | 'ownerId' | 'alias' | 'name'>
  file: FileSpace
  link: Omit<LinkGuest, 'userId'>
}
