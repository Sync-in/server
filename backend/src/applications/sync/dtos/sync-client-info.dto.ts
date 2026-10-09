import { z } from 'zod'
import { SYNC_CLIENT_TYPE } from '../constants/sync.js'

export const syncClientInfoSchema = z.object({
  node: z.string(),
  os: z.string(),
  osRelease: z.string(),
  user: z.string(),
  type: z.enum(SYNC_CLIENT_TYPE),
  version: z.string()
})
