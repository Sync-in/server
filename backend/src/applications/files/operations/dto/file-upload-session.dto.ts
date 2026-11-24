import { z } from 'zod'
import { UUID_V4_PATTERN } from '../../../../common/validation.js'

export const fileUploadSessionIdSchema = z.string().regex(UUID_V4_PATTERN)
