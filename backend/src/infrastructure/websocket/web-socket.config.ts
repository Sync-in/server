import { z } from 'zod'
import { nonEmptyStringSchema } from '../../configuration/config.schema.js'

export type WebSocketConfig = z.output<typeof WebSocketConfigSchema>

export const WebSocketConfigSchema = z.discriminatedUnion('adapter', [
  z.looseObject({
    adapter: z.literal('cluster').default('cluster'),
    // Preserve the public type without validating an inactive Redis configuration.
    redis: z.custom<string>().default('redis://127.0.0.1:6379')
  }),
  z.looseObject({
    adapter: z.literal('redis'),
    redis: nonEmptyStringSchema.default('redis://127.0.0.1:6379')
  })
])
