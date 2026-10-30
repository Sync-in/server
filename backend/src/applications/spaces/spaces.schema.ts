import { booleanFromStringSchema } from '../../configuration/config.schema.js'
import { deleteSpaceSchema } from './dto/delete-space.dto.js'

export const showFilesQuerySchema = booleanFromStringSchema.optional()
export const includeHiddenQuerySchema = booleanFromStringSchema.optional()
export const optionalDeleteSpaceBodySchema = deleteSpaceSchema.optional()
