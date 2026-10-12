import { z } from 'zod'
import { syncClientInfoSchema } from './sync-client-info.dto.js'

export const syncClientRegistrationSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
  code: z.string().nullish(),
  clientId: z.uuid(),
  info: syncClientInfoSchema
})

export type SyncClientRegistrationDto = z.infer<typeof syncClientRegistrationSchema>

export const syncClientAuthRegistrationSchema = z.object({
  clientId: z.uuid().nullish(),
  info: syncClientInfoSchema
})

export type SyncClientAuthRegistrationDto = z.infer<typeof syncClientAuthRegistrationSchema>
