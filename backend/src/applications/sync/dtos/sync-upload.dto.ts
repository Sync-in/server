import { z } from 'zod'
import { safeIntegerFromStringSchema } from '../../../configuration/config.schema.js'

export const syncUploadSchema = z.object({
  checksum: z.string().min(1).nullish(),
  mtime: safeIntegerFromStringSchema,
  size: safeIntegerFromStringSchema.pipe(z.number().min(0))
})

export type SyncUploadDto = z.infer<typeof syncUploadSchema>
