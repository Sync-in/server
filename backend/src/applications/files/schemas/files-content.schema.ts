import { SQL, sql } from 'drizzle-orm'
import { DB_CHARSET, DB_PATH_COLLATION } from '../../../infrastructure/database/constants.js'

export const FILES_CONTENT_TABLE_PREFIX = 'files_content_' as const

// Keep content search on general_ci while matching file metadata collations.
export function createTableFilesContent(tableName: string): SQL {
  return sql`
      CREATE TABLE IF NOT EXISTS ${sql.identifier(tableName)}
      (
          id      bigint unsigned NOT NULL,
          path    varchar(4096) CHARACTER SET ${sql.raw(DB_CHARSET)} COLLATE ${sql.raw(DB_PATH_COLLATION)} NOT NULL,
          name    varchar(255) CHARACTER SET ${sql.raw(DB_CHARSET)} COLLATE ${sql.raw(DB_PATH_COLLATION)} NOT NULL,
          mime    varchar(255),
          size    bigint unsigned NOT NULL,
          mtime   bigint unsigned NOT NULL,
          content LONGTEXT,
          seen_run_id varchar(64),
          PRIMARY KEY (id),
          INDEX seen_run_id (seen_run_id),
          FULLTEXT (content)
      ) CHARACTER SET ${sql.raw(DB_CHARSET)}
        COLLATE utf8mb4_general_ci;`
}
