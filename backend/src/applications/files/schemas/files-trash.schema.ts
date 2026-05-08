export const FILES_TRASH_TABLE_PREFIX = 'files_trash_' as const

// The utf8mb4_uca1400_ai_ci COLLATE is better for precision but slower
export function createTableFilesTrash(tableName: string): string {
  return `
      CREATE TABLE IF NOT EXISTS ${tableName}
      (
          id      bigint unsigned NOT NULL,
          path    varchar(4096)   NOT NULL,
          isDir   boolean         NOT NULL,
          deletedAt date          NOT NULL DEFAULT CURRENT_DATE,
          seen_run_id varchar(64),
          PRIMARY KEY (id),
          INDEX is_dir_deleted_at (isDir, deletedAt),
          INDEX path_prefix (path(768)),
          INDEX seen_run_id (seen_run_id)
      ) CHARACTER SET utf8mb4
        COLLATE utf8mb4_general_ci;`
}
