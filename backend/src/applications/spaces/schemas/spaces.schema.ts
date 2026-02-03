import { SQL, sql } from 'drizzle-orm'
import { bigint, boolean, datetime, mysqlTable, uniqueIndex, varchar } from 'drizzle-orm/mysql-core'
import { SPACE_PERMS_SEP } from '../constants/spaces'

/*
  alias: used to navigate over api & webdav, must be unique
  name: set by user and showed on web
  storageQuota:
    0 : no storage
    null : unlimited
    other: limited to value
*/

export const spaces = mysqlTable(
  'spaces',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    alias: varchar('alias', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: varchar('description', { length: 255 }),
    enabled: boolean('enabled').default(true).notNull(),
    storageUsage: bigint('storageUsage', { mode: 'number', unsigned: true }).default(0).notNull(),
    storageQuota: bigint('storageQuota', { mode: 'number', unsigned: true }),
    storageIndexing: boolean('storageIndexing').default(true).notNull(),
    createdAt: datetime('createdAt', { mode: 'date' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    modifiedAt: datetime('modifiedAt', { mode: 'date' }).default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
    disabledAt: datetime('disabledAt', { mode: 'date' })
  },
  (table) => [uniqueIndex('alias_idx').on(table.alias)]
)

export const spaceGroupConcatPermissions = (column: any, separator = SPACE_PERMS_SEP): SQL<string> =>
  sql`IFNULL(GROUP_CONCAT(DISTINCT(IF(${column} = '', null, ${column})) SEPARATOR ${sql.raw(`'${separator}'`)}), '')`
