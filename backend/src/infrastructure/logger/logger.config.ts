import { z } from 'zod'
import { DEFAULT_LOG_FILE_PATH } from '../../configuration/config.constants.js'
import { nonEmptyStringSchema } from '../../configuration/config.schema.js'

export type LoggerConfig = z.output<typeof LoggerConfigSchema>

export const LoggerConfigSchema = z.looseObject({
  level: nonEmptyStringSchema.default('info'),
  stdout: z.boolean().default(true),
  colorize: z.boolean().default(true),
  filePath: z.preprocess((value) => value || DEFAULT_LOG_FILE_PATH, z.string()).default(DEFAULT_LOG_FILE_PATH),
  jsonOutput: z.boolean().nullish().default(false)
})
