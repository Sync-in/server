import { customType } from 'drizzle-orm/mysql-core'
import { DB_CHARSET, DB_PATH_COLLATION } from './constants.js'

export const pathVarchar = customType<{
  data: string
  driverData: string
  config: { length: number }
  configRequired: true
}>({
  dataType({ length }) {
    return `varchar(${length}) CHARACTER SET ${DB_CHARSET} COLLATE ${DB_PATH_COLLATION}`
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
