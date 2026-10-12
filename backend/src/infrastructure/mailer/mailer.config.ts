import { z } from 'zod'
import { nonEmptyStringSchema } from '../../configuration/config.schema.js'

export type MailerConfig = z.output<typeof MailerConfigSchema>

export const AuthMailConfigSchema = z.looseObject({
  user: nonEmptyStringSchema,
  pass: nonEmptyStringSchema
})

export const MailerConfigSchema = z.looseObject({
  host: nonEmptyStringSchema,
  port: z.number().int().min(0).max(65535).default(25),
  secure: z.boolean().nullish().default(false),
  ignoreTLS: z.boolean().nullish().default(false),
  rejectUnauthorized: z.boolean().nullish().default(true),
  auth: AuthMailConfigSchema.nullish(),
  sender: z.string().nullish().default('Sync-in<notification@sync-in.com>'),
  logger: z.boolean().nullish().default(false)
})
