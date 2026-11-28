import { z } from 'zod'
import { optionalHttpBaseUrlSchema } from '../../../../configuration/config.schema.js'

function normalizePhotopeaUrl(url: string): string {
  const parsedUrl = new URL(url)
  if (!parsedUrl.pathname.endsWith('/')) parsedUrl.pathname += '/'
  return parsedUrl.toString()
}

export const PhotopeaConfigSchema = z.discriminatedUnion('enabled', [
  z.looseObject({
    enabled: z.literal(false).default(false),
    externalServer: optionalHttpBaseUrlSchema.default(null)
  }),
  z.looseObject({
    enabled: z.literal(true),
    externalServer: optionalHttpBaseUrlSchema.transform((url) => normalizePhotopeaUrl(url ?? 'https://www.photopea.com'))
  })
])
