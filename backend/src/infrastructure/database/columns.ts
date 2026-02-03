import { customType } from 'drizzle-orm/mysql-core'

export const jsonColumn = <T>() =>
  customType<{ data: T; driverData: string | null }>({
    dataType() {
      // MariaDB will store in LONGTEXT with JSON constraint, but "json" remains correct on the DDL side
      return 'json'
    },
    toDriver(value) {
      return value == null ? null : JSON.stringify(value)
    },
    fromDriver(value) {
      if (value == null) return null as unknown as T
      if (typeof value === 'string') {
        try {
          return JSON.parse(value) as T
        } catch {
          // Corrupt or non-JSON value: returns null (or throws if you prefer)
          return null as unknown as T
        }
      }
      // In the (rare) case where the driver already returns an object
      return value as unknown as T
    }
  })
