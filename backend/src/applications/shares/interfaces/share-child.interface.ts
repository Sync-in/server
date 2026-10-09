import type { Share } from '../schemas/share.interface.js'

export interface ShareChildQuery extends Pick<Share, 'id' | 'parentId' | 'type' | 'alias' | 'name'> {
  id: number
  parentId: number
  type: number
  alias: string
  name: string
  ownerLogin: string | null
  ownerFullName: string | null
  ownerEmail: string | null
  fileMime: string | null
}

export interface ShareChildMember {
  id: number
  userId: number
  userPermissions: string
  shareId: number
  shareAlias: string
  shareName: string
}
