import { NotificationContent } from '../interfaces/notification-properties.interface'
import { notifications } from './notifications.schema'

type NotificationSchema = typeof notifications.$inferSelect

export class Notification implements NotificationSchema {
  id: number
  toUserId: number
  fromUserId: number
  content: NotificationContent
  wasRead: boolean
  createdAt: Date
}
