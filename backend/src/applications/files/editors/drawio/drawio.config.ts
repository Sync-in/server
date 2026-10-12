import { z } from 'zod'
import { optionalHttpBaseUrlSchema } from '../../../../configuration/config.schema.js'

export const DrawioConfigSchema = z.looseObject({
  enabled: z.boolean().default(false),
  externalServer: optionalHttpBaseUrlSchema.default(null)
})
