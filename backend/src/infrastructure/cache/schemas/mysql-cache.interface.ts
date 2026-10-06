import { cache } from './mysql-cache.schema.js'

type MysqlCacheSchema = typeof cache.$inferSelect

export class MysqlCache implements MysqlCacheSchema {
  key: string
  value: any
  expiration: number
}
