import { z } from 'zod'
import { integerNumberSchema } from '../../../configuration/config.schema.js'
import { USER_GROUP_ROLE, USER_NOTIFICATION, USER_PASSWORD_MIN_LENGTH, USER_ROLE } from '../constants/user.js'
import { userLoginSchema } from './user-login.schema.js'

const trimmedStringSchema = z.string().trim()

const loginSchema = trimmedStringSchema.pipe(userLoginSchema.min(2).max(255))
const emailSchema = trimmedStringSchema.pipe(z.email({ pattern: z.regexes.html5Email }).min(2).max(254))
const profileNameSchema = trimmedStringSchema
  .max(255)
  .nullable()
  .transform((value) => value ?? '')

export const optionalUserSchema = z.object({
  lastName: profileNameSchema.optional(),
  role: z.enum(USER_ROLE).nullish(),
  isActive: z.boolean().optional(),
  language: z.string().nullish(),
  notification: z.enum(USER_NOTIFICATION).nullish(),
  permissions: z.string().nullish(),
  storageQuota: integerNumberSchema.nullish(),
  // for users and guests
  groups: z.array(integerNumberSchema).nullish(),
  // for guests
  managers: z.array(integerNumberSchema).nullish()
})

export const createUserSchema = optionalUserSchema.extend({
  login: loginSchema,
  email: emailSchema,
  password: z.string().min(USER_PASSWORD_MIN_LENGTH).max(255),
  firstName: profileNameSchema
})

type CreateUserSchemaOutput = z.output<typeof createUserSchema>
type CreateUserRequiredKey = 'login' | 'email' | 'firstName'

export type CreateUserDto = CreateUserSchemaOutput & Required<Pick<CreateUserSchemaOutput, CreateUserRequiredKey>>

export const updateUserSchema = optionalUserSchema.extend({
  login: loginSchema.optional(),
  email: emailSchema.optional(),
  password: z.string().min(USER_PASSWORD_MIN_LENGTH).max(255).nullish(),
  firstName: profileNameSchema.optional()
})

export type UpdateUserDto = z.infer<typeof updateUserSchema>

export const updateUserFromGroupSchema = z.object({
  role: z.enum(USER_GROUP_ROLE)
})

export type UpdateUserFromGroupDto = z.infer<typeof updateUserFromGroupSchema>
