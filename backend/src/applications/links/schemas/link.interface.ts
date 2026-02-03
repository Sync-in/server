import type { links } from './links.schema'

type LinkSchema = typeof links.$inferSelect

export class Link implements LinkSchema {
  id: number
  uuid: string
  userId: number
  name: string
  email: string
  requireAuth: boolean
  nbAccess: number
  limitAccess: number
  expiresAt: Date
  createdAt: Date
}
