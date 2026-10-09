import { z } from 'zod'
import { safeIntegerFromStringSchema } from '../../../configuration/config.schema.js'

export const oauthDesktopPortSchema = safeIntegerFromStringSchema.optional()
export const oidcCallbackQuerySchema = z.record(z.string(), z.string())
