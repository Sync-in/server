import { z } from 'zod'
import { nonEmptyStringSchema } from '../../configuration/config.schema.js'

export const CacheConfigSchema = z.discriminatedUnion('adapter', [
  z.looseObject({
    adapter: z.literal('mysql').default('mysql'),
    ttl: z.number().int().min(1).default(60),
    // Preserve the public type without validating an inactive Redis configuration.
    redis: z.custom<string>().default('redis://127.0.0.1:6379')
  }),
  z.looseObject({
    adapter: z.literal('redis'),
    ttl: z.number().int().min(1).default(60),
    redis: nonEmptyStringSchema.default('redis://127.0.0.1:6379')
  })
])
