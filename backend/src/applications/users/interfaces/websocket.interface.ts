import type { USER_ONLINE_STATUS } from '../constants/user'

export interface UserOnline {
  id: number
  login: string
  email: string
  fullName: string
  onlineStatus: USER_ONLINE_STATUS
}

export interface EventUpdateOnlineStatus {
  userId: number
  status: USER_ONLINE_STATUS
}

export interface EventChangeOnlineStatus {
  status: USER_ONLINE_STATUS
  store: boolean
}
