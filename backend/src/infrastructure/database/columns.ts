import { customType } from 'drizzle-orm/mysql-core'
import { DB_CHARSET, DB_PATH_COLLATION } from './constants.js'

export const pathVarchar = customType<{
  data: string
  driverData: string
  config: { length: number; collation?: string }
  configRequired: true
}>({
  dataType({ length, collation = DB_PATH_COLLATION }) {
    return `varchar(${length}) CHARACTER SET ${DB_CHARSET} COLLATE ${collation}`
  }
})

export const jsonColumn = <T>() =>
  customType<{ data: T; driverData: string | null }>({
    dataType() {
      // MariaDB will store in LONGTEXT with JSON constraint, but "json" remains correct on the DDL side
      return 'json'
    },
    toDriver(value) {
      return value == null ? null : JSON.stringify(value)
    }
  })
