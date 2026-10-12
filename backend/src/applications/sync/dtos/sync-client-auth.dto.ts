import { z } from 'zod'
import { syncClientInfoSchema } from './sync-client-info.dto.js'

export const syncClientAuthSchema = z.object({
  clientId: z.uuid(),
  token: z.uuid(),
  info: syncClientInfoSchema,
  tokenHasExpired: z.boolean().nullish()
})

export type SyncClientAuthDto = z.infer<typeof syncClientAuthSchema>
