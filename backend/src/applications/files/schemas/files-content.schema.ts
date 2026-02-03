export const FILES_CONTENT_TABLE_PREFIX = 'files_content_' as const

// The utf8mb4_uca1400_ai_ci COLLATE is better for precision but slower
export function createTableFilesContent(tableName: string): string {
  return `
      CREATE TABLE IF NOT EXISTS ${tableName}
      (
          id      bigint          NOT NULL,
          path    varchar(4096)   NOT NULL,
          name    varchar(255)    NOT NULL,
          mime    varchar(255),
          size    bigint unsigned NOT NULL,
          mtime   bigint unsigned NOT NULL,
          content LONGTEXT,
          FULLTEXT (content),
          CONSTRAINT files_content_id PRIMARY KEY (id)
      ) CHARACTER SET utf8mb4
        COLLATE utf8mb4_general_ci;`
}
