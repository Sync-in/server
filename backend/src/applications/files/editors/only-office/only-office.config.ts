import { z } from 'zod'
import { nonEmptyStringSchema, optionalHttpBaseUrlSchema } from '../../../../configuration/config.schema.js'

export const OnlyOfficeConfigSchema = z.discriminatedUnion('enabled', [
  z.looseObject({
    enabled: z.literal(false).default(false),
    externalServer: optionalHttpBaseUrlSchema.default(null),
    // Preserve the public type without validating an inactive editor secret.
    secret: z
      .custom<string>()
      .optional()
      .transform((value) => value as string),
    verifySSL: z.boolean().default(false)
  }),
  z.looseObject({
    enabled: z.literal(true),
    externalServer: optionalHttpBaseUrlSchema.default(null),
    secret: nonEmptyStringSchema,
    verifySSL: z.boolean().default(false)
  })
])
