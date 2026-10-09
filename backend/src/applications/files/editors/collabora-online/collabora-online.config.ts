import { z } from 'zod'
import { optionalHttpBaseUrlSchema } from '../../../../configuration/config.schema.js'

export const CollaboraOnlineConfigSchema = z.looseObject({
  enabled: z.boolean().default(false),
  externalServer: optionalHttpBaseUrlSchema.default(null)
})
