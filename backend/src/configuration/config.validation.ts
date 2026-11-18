import { cpus } from 'node:os'
import { z } from 'zod'
import { ApplicationsConfigSchema } from '../applications/applications.config.js'
import { AuthConfigSchema } from '../authentication/auth.config.js'
import { CacheConfigSchema } from '../infrastructure/cache/cache.config.js'
import { MySQLConfigSchema } from '../infrastructure/database/database.config.js'
import { LoggerConfigSchema } from '../infrastructure/logger/logger.config.js'
import { MailerConfigSchema } from '../infrastructure/mailer/mailer.config.js'
import { WebSocketConfigSchema } from '../infrastructure/websocket/web-socket.config.js'
import { httpBaseUrlSchema } from './config.schema.js'

export type GlobalConfig = z.output<typeof GlobalConfigSchema>

export const ServerConfigSchema = z.looseObject({
  host: z.union([z.ipv4(), z.ipv6()]).default('0.0.0.0'),
  port: z.number().int().min(1024).max(65535).default(8080),
  publicUrl: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim().replace(/\/+$/, '') || undefined : value),
    httpBaseUrlSchema.nullish()
  ),
  workers: z
    .preprocess((value) => (value === 0 || value === 'auto' ? cpus().length : Math.max(Number(value), 1)), z.number().int().min(1))
    .default(1),
  // Preserve permissive proxy settings and deprecated numeric hop counts.
  trustProxy: z.preprocess((value) => (typeof value === 'number' ? value >= 1 : value), z.custom<boolean | string>()).default(true),
  restartOnFailure: z.boolean().default(true)
})

export const GlobalConfigSchema = z.looseObject({
  server: ServerConfigSchema.prefault({}),
  logger: LoggerConfigSchema.prefault({}),
  mysql: MySQLConfigSchema,
  cache: CacheConfigSchema.prefault({}),
  websocket: WebSocketConfigSchema.prefault({}),
  auth: AuthConfigSchema,
  mail: MailerConfigSchema.nullish(),
  applications: ApplicationsConfigSchema
})
