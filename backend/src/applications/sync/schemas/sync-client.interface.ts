import type { syncClients } from './sync-clients.schema.js'

export type SyncClient = typeof syncClients.$inferSelect
