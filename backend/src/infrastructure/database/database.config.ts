import { z } from 'zod'
import { nonEmptyStringSchema } from '../../configuration/config.schema.js'
import { DB_CHARSET } from './constants.js'

export const MySQLConfigSchema = z.looseObject({
  url: nonEmptyStringSchema.overwrite((value) => (value.endsWith(`?charset=${DB_CHARSET}`) ? value : `${value}?charset=${DB_CHARSET}`)),
  logQueries: z.boolean().default(false)
})
