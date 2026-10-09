import { positiveIntegerFromStringSchema } from '../../configuration/config.schema.js'

export const recentCommentsLimitQuerySchema = positiveIntegerFromStringSchema.optional()
