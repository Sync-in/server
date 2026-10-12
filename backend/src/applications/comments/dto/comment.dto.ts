import { z } from 'zod'
import { integerNumberSchema } from '../../../configuration/config.schema.js'

export const createOrUpdateCommentSchema = z.object({
  fileId: integerNumberSchema,
  content: z.string().min(1),
  commentId: integerNumberSchema.nullish()
})

export type CreateOrUpdateCommentDto = z.infer<typeof createOrUpdateCommentSchema>

export const deleteCommentSchema = z.object({
  fileId: integerNumberSchema,
  commentId: integerNumberSchema
})

export type DeleteCommentDto = z.infer<typeof deleteCommentSchema>
