import type { Share } from '../schemas/share.interface.js'

export type ShareIdentity = Pick<Share, 'id' | 'alias' | 'name'> & Partial<Omit<Share, 'id' | 'alias' | 'name'>>
export type ShareDescriptor = Pick<Share, 'alias' | 'name'>
export type ShareOwnerIdentity = Pick<Share, 'id' | 'ownerId'>
export type ShareSelection = Pick<Share, 'id' | 'ownerId' | 'alias' | 'name'>
