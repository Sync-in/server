import type { USER_GROUP_ROLE } from '@sync-in-server/backend/src/applications/users/constants/user'
import type { OwnerType } from './owner.interface'

export interface GroupType {
  id: number
  name: string
  role?: USER_GROUP_ROLE
  members: OwnerType[]
}
