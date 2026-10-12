import { z } from 'zod'
import { integerNumberSchema } from '../../../configuration/config.schema.js'
import { sanitizeName } from '../../files/utils/files.js'
import { GROUP_VISIBILITY } from '../constants/group.js'

const optionalGroupNameSchema = z.string().trim().overwrite(sanitizeName).min(1).optional()

export const userCreateOrUpdateGroupSchema = z.object({
  name: optionalGroupNameSchema,
  description: z.string().nullish()
})

export type UserCreateOrUpdateGroupDto = z.infer<typeof userCreateOrUpdateGroupSchema>

export const createOrUpdateGroupSchema = userCreateOrUpdateGroupSchema.extend({
  visibility: z.enum(GROUP_VISIBILITY).nullish(),
  permissions: z.string().nullish(),
  parentId: integerNumberSchema.nullish()
})

export type CreateOrUpdateGroupDto = z.infer<typeof createOrUpdateGroupSchema>

export const userIdsSchema = z.array(integerNumberSchema)
