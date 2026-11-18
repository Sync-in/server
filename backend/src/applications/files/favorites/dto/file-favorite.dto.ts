import { z } from 'zod'
import { integerNumberSchema } from '../../../../configuration/config.schema.js'
import { fileReferenceIdSchema } from '../../core/schemas/files-validation.schema.js'

export const fileFavoriteSchema = z.object({
  fileId: fileReferenceIdSchema
})

export type FileFavoriteDto = z.infer<typeof fileFavoriteSchema>

export const deleteFileFavoriteSchema = z.object({
  fileId: integerNumberSchema.min(1)
})

export type DeleteFileFavoriteDto = z.infer<typeof deleteFileFavoriteSchema>
