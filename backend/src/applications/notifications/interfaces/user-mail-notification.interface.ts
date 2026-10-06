import { USER_NOTIFICATION } from '../../users/constants/user.js'

export interface UserMailNotification {
  id: number
  email: string
  language: string
  notification: USER_NOTIFICATION
}
