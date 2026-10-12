import { z } from 'zod'
import { AUTH_SCOPE } from '../../../authentication/constants/scope.js'
import { currentDate } from '../../../common/shared.js'
import { COLLABORA_EDITOR } from '../../files/editors/collabora-online/collabora-online.constants.js'
import { EURO_OFFICE_EDITOR, ONLY_OFFICE_EDITOR } from '../../files/editors/only-office/only-office.constants.js'
import { USER_PASSWORD_MIN_LENGTH } from '../constants/user.js'
import { USER_SIDEBAR_QUICK_ACCESS_POSITION, USER_SIDEBAR_QUICK_ACCESS_VISIBILITY, USER_THEME } from '../constants/user-preferences.js'

export const userLanguageSchema = z.object({
  language: z.string().nullable()
})

export type UserLanguageDto = z.infer<typeof userLanguageSchema>

export const userNotificationSchema = z.object({
  notification: z.number().int()
})

export type UserNotificationDto = z.infer<typeof userNotificationSchema>

export const userStorageIndexingSchema = z.object({
  storageIndexing: z.boolean()
})

export type UserStorageIndexingDto = z.infer<typeof userStorageIndexingSchema>

export const userPreferencesSchema = z.object({
  theme: z.enum(USER_THEME).optional(),
  editor: z.enum([COLLABORA_EDITOR, ONLY_OFFICE_EDITOR, EURO_OFFICE_EDITOR]).nullish(),
  useSystemNotifications: z.boolean().optional(),
  sidebarQuickAccessVisibility: z.enum(USER_SIDEBAR_QUICK_ACCESS_VISIBILITY).optional(),
  sidebarQuickAccessPosition: z.enum(USER_SIDEBAR_QUICK_ACCESS_POSITION).optional()
})

export type UserPreferencesDto = z.infer<typeof userPreferencesSchema>

export const userUpdatePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(USER_PASSWORD_MIN_LENGTH)
})

export type UserUpdatePasswordDto = z.infer<typeof userUpdatePasswordSchema>

export const userPasswordSchema = z.object({
  password: z.string().min(USER_PASSWORD_MIN_LENGTH)
})

export type UserPasswordDto = z.infer<typeof userPasswordSchema>

export const userAppPasswordSchema = z.object({
  name: z.string().min(1),
  app: z.string().toLowerCase().pipe(z.enum(AUTH_SCOPE)),
  expiration: z
    .preprocess((value) => (typeof value === 'string' ? (value ? currentDate(value) : null) : value ? value : null), z.date().nullable())
    .optional()
})

export type UserAppPasswordDto = z.infer<typeof userAppPasswordSchema>
