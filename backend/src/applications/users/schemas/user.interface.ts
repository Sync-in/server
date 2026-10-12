import type { users } from './users.schema.js'

export type User = typeof users.$inferSelect
