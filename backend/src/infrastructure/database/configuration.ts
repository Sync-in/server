import { Config, defineConfig } from 'drizzle-kit'
import { configLoader } from '../../configuration/config.loader'
import { getSchemaPath, MIGRATIONS_PATH } from './constants'

export default defineConfig({
  schema: getSchemaPath(),
  out: MIGRATIONS_PATH,
  strict: false,
  dialect: 'mysql',
  url: configLoader().mysql.url,
  tablesFilter: ['files_content_*']
} as Config)
