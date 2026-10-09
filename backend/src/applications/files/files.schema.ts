import { z } from 'zod'
import { booleanFromStringSchema, positiveIntegerFromStringSchema, safeIntegerFromStringSchema } from '../../configuration/config.schema.js'
import { isValidFileReferenceId } from './utils/files.js'

export const fileReferenceIdSchema = z.number().refine(isValidFileReferenceId, { message: 'Invalid file id' })
export const filesRecentsLimitQuerySchema = positiveIntegerFromStringSchema.optional()
export const thumbnailSizeQuerySchema = safeIntegerFromStringSchema.optional()
export const forceAsFileOwnerQuerySchema = booleanFromStringSchema.optional()
export const taskIdParameterSchema = z.string()
export const optionalTaskIdParameterSchema = taskIdParameterSchema.optional()
