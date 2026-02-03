import { cache } from './mysql-cache.schema'

type MysqlCacheSchema = typeof cache.$inferSelect

export class MysqlCache implements MysqlCacheSchema {
  key: string
  value: any
  expiration: number
}
