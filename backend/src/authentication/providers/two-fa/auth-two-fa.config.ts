import { z } from 'zod'
import { SERVER_NAME } from '../../../common/shared.js'

export const AuthMFATotpConfigSchema = z.looseObject({
  enabled: z.boolean().default(true),
  issuer: z.string().default(SERVER_NAME)
})

export const AuthMFAConfigSchema = z.looseObject({ totp: AuthMFATotpConfigSchema.prefault({}) })
