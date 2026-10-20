import { SQL, sql } from 'drizzle-orm'
import { DB_CHARSET, DB_PATH_COLLATION } from '../../../infrastructure/database/constants.js'

export const FILES_TRASH_TABLE_PREFIX = 'files_trash_' as const

export function createTableFilesTrash(tableName: string): SQL {
  return sql`
      CREATE TABLE IF NOT EXISTS ${sql.identifier(tableName)}
      (
          id      bigint unsigned NOT NULL,
          path    varchar(4096) NOT NULL,
          isDir   boolean         NOT NULL,
          deletedAt date          NOT NULL DEFAULT CURRENT_DATE,
          seen_run_id varchar(64),
          PRIMARY KEY (id),
          INDEX is_dir_deleted_at (isDir, deletedAt),
          INDEX path_prefix (path(768)),
          INDEX seen_run_id (seen_run_id)
      ) CHARACTER SET ${sql.raw(DB_CHARSET)}
        COLLATE ${sql.raw(DB_PATH_COLLATION)};`
}
