import { customType } from 'drizzle-orm/mysql-core'

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
