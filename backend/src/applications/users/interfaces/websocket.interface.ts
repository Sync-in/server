import { z } from 'zod'
import { USER_ONLINE_STATUS } from '../constants/user.js'

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

export const eventChangeOnlineStatusSchema = z.object({
  status: z.enum(USER_ONLINE_STATUS),
  store: z.boolean()
})

export type EventChangeOnlineStatus = z.infer<typeof eventChangeOnlineStatusSchema>
