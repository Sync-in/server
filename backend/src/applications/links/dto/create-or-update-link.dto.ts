import { z } from 'zod'
import { currentDate } from '../../../common/shared.js'
import { USER_PASSWORD_MIN_LENGTH } from '../../users/constants/user.js'

export const createOrUpdateLinkSchema = z.object({
  uuid: z.string().nullish(),
  name: z.string().nullish(),
  email: z.string().nullish(),
  language: z.string().nullish(),
  limitAccess: z.coerce.number().optional(),
  expiresAt: z
    .preprocess((value) => (typeof value === 'string' ? (value ? currentDate(value) : null) : value ? value : null), z.date().nullable())
    .optional(),
  requireAuth: z.coerce.boolean().optional(),
  isActive: z.coerce.boolean().optional(),
  permissions: z.string().nullish(),
  password: z.string().min(USER_PASSWORD_MIN_LENGTH).nullish(),
  // used for update link from links component
  shareName: z.string().nullish(),
  // used for update link from links component
  shareDescription: z.string().nullish()
})

export type CreateOrUpdateLinkDto = z.infer<typeof createOrUpdateLinkSchema>
