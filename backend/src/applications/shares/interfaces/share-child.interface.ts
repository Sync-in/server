import type { Share } from '../schemas/share.interface'

export interface ShareChildQuery extends Pick<Share, 'id' | 'parentId' | 'type' | 'alias' | 'name'> {
  id: number
  parentId: number
  type: number
  alias: string
  name: string
  ownerLogin: string
  ownerFullName: string
  ownerEmail: string
  fileMime: string
}

export interface ShareChildMember {
  id: number
  userId: number
  userPermissions: string
  shareId: number
  shareAlias: string
  shareName: string
}
